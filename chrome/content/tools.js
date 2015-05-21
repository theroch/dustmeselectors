/*******************************************************************************
 DMS4.1 :: Dust-Me Selectors v4.1
 -------------------------------------------------------------------------------
 Copyright (c) 2007-13 James Edwards (brothercake)        <cake@brothercake.com>
 MIT License                      http://opensource.org/licenses/mit-license.php
 Info/Docs                            http://www.brothercake.com/dustmeselectors
 -------------------------------------------------------------------------------
 Contributors:
 -------------------------------------------------------------------------------
 Andrew Krespanis   [Concept]                           http://leftjustified.net
 Paul Annesley      [Concept]                            http://paul.annesley.cc
 Lachlan Donald     [Concept]                                  http://lachlan.me
 Alex Walker        [Icon design]    http://www.sitepoint.com/author/alex-walker
 -------------------------------------------------------------------------------
*******************************************************************************/


/* NOTE:
this script is included by browser.xul, spider.xul and preferences.xul
however the latter two dialogs are child windows of the main browser
so remember that each instance expects a different window heirarchy
*/

//dust-me selectors tools object
var DustMeSelectors_tools = new Object();

//load the Place utilities, so we can reference the favicon service for loading and retrieving sitemap favicons
Components.utils.import("resource://gre/modules/PlacesUtils.jsm");

//initialize the IO service, which we use for creating URI objects from string URLs
//which is needed for the favicon and effective TLD services
//and is also how we create the data-preference name from eg. a sitemap URL
DustMeSelectors_tools.ioService = Components.classes["@mozilla.org/network/io-service;1"]
	.getService(Components.interfaces.nsIIOService);  

//initialize the effective TLD service, which we use to examine page URLs 
//so we can implement the "treat sub-domains as the same site" preference
DustMeSelectors_tools.domainService = Components.classes["@mozilla.org/network/effective-tld-service;1"]
	.getService(Components.interfaces.nsIEffectiveTLDService);
	
//initialize the observer service, which we use to detect when the 
//application quits, so we can implement auto-delete of stored data
DustMeSelectors_tools.observerService = Components.classes["@mozilla.org/observer-service;1"]
	.getService(Components.interfaces.nsIObserverService);
	
//initialize the window mediator service, which we use for getting 
//references to one or all of the currently open browser windows
DustMeSelectors_tools.windowService = Components.classes["@mozilla.org/appshell/window-mediator;1"]
	.getService(Components.interfaces.nsIWindowMediator);





//when the chrome has loaded
window.addEventListener('load', function()
{

	//load the properties bundle
	DustMeSelectors_tools.bundle = document.getElementById('dms-bundle');


	//get the platform from nsIXULRuntime, which should be "darwin", "linux" or "winnt"
	//nb. default to "winnt" for safety if we can't get the info, since the runtime
	//OS information is not necessarily available on all versions and platforms
	//nb. create a a global property but also a local var for shorter referencing below
	var runtime = Components.classes["@mozilla.org/xre/app-info;1"]
					.getService(Components.interfaces.nsIXULRuntime);
	DustMeSelectors_tools.platform = (runtime.OS || 'WINNT').toLowerCase();
	

	//initialize the alert service
	DustMeSelectors_tools.initialiseAlertService();
	

}, false);





//initialize the alert service
//nb. it really doesn't matter if the service fails
//since the notifications we pass through it are passive
//so we capture failure and nulify the service so it doesn't try again
DustMeSelectors_tools.initialiseAlertService = function()
{
	try
	{
		DustMeSelectors_tools.alerts = Components.classes["@mozilla.org/alerts-service;1"]
			.getService(Components.interfaces['nsIAlertsService']);
	}
	catch(err)
	{
		DustMeSelectors_tools.alerts = null;
	}
};

//show a notification using the alert service
//which displays a small pop-up notification in the corner of the screen
DustMeSelectors_tools.notify = function(message)
{
	if(!DustMeSelectors_tools.alerts) { return; }
	
	//nb. I used to use a 32px variant of this 50px icon 
	//because toaster for xp uses a smaller version and doesn't resize nicely
	//(whereas growl uses 50px and does resize nicely anyway)
	//but windows 7 now uses the larger icon too, so we just use that 
	DustMeSelectors_tools.alerts.showAlertNotification(
		'chrome://dustmeselectors/content/notifyicon.png',
		DustMeSelectors_tools.bundle.getString('notification.title'),
		message
		);
};



//show a notification using the notificationbox system
//which displays an information strip across the top of the browser
DustMeSelectors_tools.boxnotify = function(message)
{
	//wrap this in exception handling, just in case of unknown failure
	try
	{
		//get the notification box object, which will be in the current window
		//for a normal scan, or in the opener window for a spider operation
		if(typeof DustMeSelectors_spider != 'undefined')
		{
			var notification = opener.gBrowser.getNotificationBox();
		}
		else
		{
			notification = gBrowser.getNotificationBox();
		}
	}
	//and if we catch an exception, just exit
	catch(ex) { return; }
	
	//get the priroty flag from preferences, 
	//or reset to default and re-save if the flag is invalid
	var boxpriority = DustMeSelectors_preferences.getPreference('string', 'boxpriority');
	if(!/^(info|warning|critical)$/i.test(boxpriority))
	{
		DustMeSelectors_preferences.setPreference('string', 'boxpriority', (boxpriority = DustMeSelectors_preferences.defaults.boxpriority));
	}
	
	//pause a moment before doing this, as a threading trick 
	//in case the view dialog is open and updated at the same time 
	//which causes the notification transition to be slow and jerky 
	//but if we do this then it effectively kills the transition, 
	//waiting until the view has compiled and then instantly appearing
	setTimeout(function()
	{
		//remove any current notification, but only if it's one of ours 
		//(so we don't interfere with other notifications using this system)
		if(notification.getNotificationWithValue('dustmeselectors-notify'))
		{
			notification.removeCurrentNotification();
		}
	
		//create a new notification with the specified message
		//and using the high-priority version of the specified priority flag
		notification.appendNotification(
			message, 
			'dustmeselectors-notify',
			'chrome://dustmeselectors/content/statusicon_default.png',
			notification['PRIORITY_' + boxpriority.toUpperCase() + '_HIGH'],
			null
			);
	}, 100);
};





//initialize the data saving options
DustMeSelectors_tools.initialiseDataSavingOptions = function()
{
	//get the dustmeselectors data directory, creating both it 
	//and the hostsindex and autorunhosts files if they don't exist
	//if there's any legacy hosts information this method will return an array of those hosts
	//otherwise it will return null to signify that there's no legacy data
	var legacyindex = DustMeSelectors_filesystem.getDataFolder();

	//***DEV
	//try { window.content.console.log('initialiseDataSavingOptions(datapath="'+DustMeSelectors_filesystem.datapath+'")'); }
	//catch(ex) { opener.window.content.console.log('initialiseDataSavingOptions(datapath="'+DustMeSelectors_filesystem.datapath+'")'); }

	//get the hosts index object
	this.hostsindex = this.getHostsIndex();
	
	//then if we have any legacy hosts information, 
	//add each one to the hostsindex, then save and re-get the data
	//this will only ever happen once - the first time a user loads version 3.0 
	//with legacy information, because the legacy file is deleted once found and parsed
	if(legacyindex.length > 0)
	{
		var n = this.count(this.hostsindex);
		for(var i=0; i<legacyindex.length; i++)
		{
			this.hostsindex[n++] = { 'host' : legacyindex[i] };
		}
		DustMeSelectors_filesystem.dumpToFile('hostsindex.json', this.Object_toJSONString(this.hostsindex));
		this.hostsindex = this.getHostsIndex();
	}
	
	//if we have a browser object
	if(typeof DustMeSelectors_browser != 'undefined')
	{
		//if we have no listed hosts at the moment
		if(this.count(this.hostsindex) == 0)
		{
			//disable the view selectors menu items
			//and the parent menu of the clear selectors items
			DustMeSelectors_browser.setUIState('view-clearmenu', true);
		}

		//otherwise we have hosts
		else
		{
			//enable those menu items
			DustMeSelectors_browser.setUIState('view-clearmenu', false);
		}
	}
};



//get the hosts index, or create an empty array if it doesn't exist
DustMeSelectors_tools.getHostsIndex = function()
{
	//create a new hostsindex object if the hostsindex file is empty 
	//(or it's a JSON string of an empty object / object with an empty object)
	var index = DustMeSelectors_filesystem.getFromFile('hostsindex.json');
	if(index == '' || index == '{}' || index == '{{}}')
	{
		index = {};
	}
	//otherwise decode the JSON to create the array
	else
	{
		index = DustMeSelectors_tools.String_parseJSON(index);
	}

	//return the hosts index array
	return index;
};


//update the hosts index, either adding new hosts if they don't exist already
//or deleting exists hosts from the index
DustMeSelectors_tools.updateHostsIndex = function(hostdata, addthis)
{
	//iterate through the existing hosts in the index
	//to find out if the input host already exists
	//record a reference to its key 
	//and remove it if addthis is false
	//counting the number of hosts as we go (not including the one we remove!)
	var exists = false, hostkey, hostscount = 0;
	for(var i in this.hostsindex)
	{
		if(!this.hostsindex.hasOwnProperty(i)) { continue; }

		if(this.hostsindex[i].host == hostdata.host)
		{
			hostkey = i;
			exists = true;
			
			if(!addthis) 
			{ 
				delete this.hostsindex[i]; 
			}
			else { hostscount++; }
		}
		else { hostscount++; }
	}
	
	//if we're adding
	if(addthis)
	{
		//if the host doesn't exist
		//add this host to the object with a new key, and remember the key
		if(!exists)
		{
			this.hostsindex[hostscount] = hostdata;
			hostkey = hostscount;
		}
		
		//if the hostdata includes a "sitemap" URL, add that as well
		if(typeof hostdata.sitemap != 'undefined')
		{
			this.hostsindex[hostkey].sitemap = hostdata.sitemap;
		}
		
		//if the hostdata includes a "spidered" flag, add that as well
		if(typeof hostdata.spidered != 'undefined')
		{
			this.hostsindex[hostkey].spidered = hostdata.spidered;
		}
	}
	
	//rekey the object
	this.hostsindex = DustMeSelectors.rekey(this.hostsindex);
	
	//then JSON encode and add it back to the hosts index file
	DustMeSelectors_filesystem.dumpToFile('hostsindex.json', this.Object_toJSONString(this.hostsindex));
	
	//if we have a browser object
	if(typeof DustMeSelectors_browser != 'undefined')
	{
		//if we don't have an open spider dialog
		if(!DustMeSelectors_browser.spiderdialog || DustMeSelectors_browser.spiderdialog.closed)
		{
			//enable or disable the view menu items
			//and the parent menu of the clear selectors items
			//depending on wheher the hosts array has any length
			DustMeSelectors_browser.setUIState('view-clearmenu', hostscount == 0);
		}
		
		//if we do have an open spider dialog, 
		//pass the same data to its instance of this function
		//to keep its copy of the hostsindex in sync with this one
		//otherwise you won't be able to delete hosts while the spider is running
		//because it would be continually resaving its hostsindex 
		else
		{
			DustMeSelectors_browser.spiderdialog.DustMeSelectors_tools.updateHostsIndex(hostdata, addthis);
		}
	}
};



//get the autorunhosts array, or create the default data if it doesn't exist
DustMeSelectors_tools.getAutorunHosts = function()
{
	//create a new autorunhosts array if the autorunhosts file is empty 
	//(but only if it's empty, not if it's a JSON string of an empty array,
	// so you can have no data in the tree without it being reset to default)
	var autorunhosts = DustMeSelectors_filesystem.getFromFile('autorunhosts.json');
	if(autorunhosts == '')
	{
		autorunhosts = [{ "host" : "localhost", "active" : true }];
	}
	//otherwise decode the JSON to create the array
	else
	{
		autorunhosts = DustMeSelectors_tools.String_parseJSON(autorunhosts);
	}
	
	//return the autorunhosts array
	return autorunhosts;
};




//get the data preference name from a URL or location object
DustMeSelectors_tools.getSelectorsDataPreferenceName = function(loc)
{
	//start with the default, global preference name
	var prefname = 'selectors';

	//if the save per host preference is true
	//we need to further process the location to get host and port information
	//depending on the values of the data saving preferences
	if(DustMeSelectors_preferences.getPreference('boolean', 'saveperhost'))
	{
		//get ignoreports preference
		var ignoreports = DustMeSelectors_preferences.getPreference('boolean', 'ignoreports');

		//if the input location is a string 
		if(typeof loc == 'string')
		{
			//get the effective host for this location string 
			//then add it to the prefname with a leading dot
			prefname += '.' + this.getEffectiveHost(loc);
			
			//but if the prefname ends in dot then there was no host
			//and that can only be because this function was called 
			//by a clear menu's onpopupshowing event on a local page
			//(whereas this is usually only called with a string by the spider)
			//so to ensure that the clear item can show when we have local data
			//add the local token to the preference name, so we return that
			if(/\.$/.test(prefname))
			{
				prefname += '@local';
			}
			
			//***DEV 
			//try { window.content.document.title = '(string)prefname="'+prefname+'"'; }
			//catch(ex) { try { opener.window.content.document.title = '(string)prefname="'+prefname+'"'; } catch(ex){} }
		}

		//else it will be a location object
		else
		{
			//try to get the prefname from the input location
			try
			{
				//if the location hostname is empty or undefined then treat it
				//as a local file, adding the local token to the preference name
				//nb. we need to check in case we don't have a hostname
				//for example, when the location is about:config
				if(!loc.hostname)
				{
					prefname += '.@local';
				}
				
				//else get the effective host for the location href
				//then add it to the prefname with a leading dot
				else
				{
					prefname += '.' + this.getEffectiveHost(loc.href);
				}
			}

			//if we fail to get the host, reset to the global name
			catch(ex)
			{
				prefname = 'selectors';
			}
			
			//***DEV
			//try { window.content.document.title = '(object)prefname="'+prefname+'"'; }
			//catch(ex) { try { opener.window.content.document.title = '(object)prefname="'+prefname+'"'; } catch(ex){} }
		}
	}

	//return the preference name
	return prefname;
};


//get the effective host from a string URL
//allowing for the ignoreports and ignoresubdomains preferences
//nb. this is used as the basis of the data preference name 
//and for comparing URLs to see if they're on the same site
DustMeSelectors_tools.getEffectiveHost = function(url)
{
	//get the ignoreports and ignoresubdomains preferences
	var ignoreports = DustMeSelectors_preferences.getPreference('boolean', 'ignoreports');
	var ignoresubdomains = DustMeSelectors_preferences.getPreference('boolean', 'ignoresubdomains');

	//we need exception handling here in case this is called 
	//from a page like about:config to verify the contextmenu state
	try
	{
		//convert the string URL to an IURI object
		var nsIURI = this.ioService.newURI(url, null, null);
		
		//copy the host to a local var removing any "www" prefix 
		var effhost = nsIURI.host.replace(/^(www\.)/ig, '');
		
		//then if ignoresubdomains is true, try to get the URL's 
		//base domain, and if that succeeds then save it to the host
		//nb. we need to wrap this in exception handling in case the URI 
		//is an IP address or a single-word hostname (like "localhost")
		//and if that's the case we just leave the host unchanged
		if(ignoresubdomains)
		{
			try 		{ var domain = DustMeSelectors_tools.domainService.getBaseDomain(nsIURI); }
			catch(ex) 	{ domain = null; }
			if(domain)	{ effhost = domain; }
		}
		
		//then if ignoreports is false and we have a port value 
		//add the port number with a delimiting hash
		//nb. we use hash rather than colon for legacy reason
		//(though I can't actually remember what the reason was!
		// it would be trouble for little point to change it now)
		if(!ignoreports && nsIURI.port && nsIURI.port != -1)
		{
			effhost += '#' + nsIURI.port;
		}
	}
	
	//if we fail to get the host just return an empty string
	catch(ex)
	{
		effhost = '';
	}
	
	//return the host 
	return effhost;
};


//compare a URL or existing prefname with the hostsindex object 
//and return true or false by whether we have data for the specified host
//nb. if a prefname is defined it simply saves us having to get it again
//and we determine that by looking for a protocol in the value
DustMeSelectors_tools.haveDataForHost = function(prefkey)
{
	if(/^([a-z]+)(:\/\/)/i.test(prefkey))
	{
		prefkey = DustMeSelectors_tools.getSelectorsDataPreferenceName(prefkey);
	}
	for(var i in DustMeSelectors_tools.hostsindex)
	{
		if(DustMeSelectors_tools.hostsindex.hasOwnProperty(i))
		{
			if(DustMeSelectors_tools.hostsindex[i].host == prefkey)
			{
				return true;
			}
		}
	}
	return false;
};



//get and decode saved data object for (from JSON to an object) "selectors", "used" or "log"
//or return the default value if there isn't any
DustMeSelectors_tools.getDataObject = function(prefname, datatype, def)
{
	//if data is empty return the default
	//otherwise decode the data and return that object
	var data = DustMeSelectors_filesystem.getFromFile(prefname.replace('selectors', datatype) + '.json');
	if(data == '' || data == '{}')
	{
		return def;
	}
	else
	{
		try { return DustMeSelectors_tools.String_parseJSON(data); }

		//if parseJSON throws an error, return the json error message
		//this will only happen if the JSON is malformed,
		//eg. through being manually edited (badly)
		catch(err)
		{
			return DustMeSelectors_tools.bundle.getString('error.json');
		}
	}
};



//get the totals information we need to update the summary of a find operation
//used for the viewsummary in the data dialog, and for notification
DustMeSelectors_tools.getViewSummaryTotals = function(data)
{
	var totals = { groups : 0, sheets : 0, rules : 0 };
	for(var i in data)
	{
		if(!data.hasOwnProperty(i)) { continue; }
		totals.groups++;
		if(typeof data[i] == 'object')
		{
			totals.sheets++;
			for(var j in data[i])
			{
				if(!data[i].hasOwnProperty(j)) { continue; }
				totals.rules++;
			}
		}
	}
	return totals;
};




//qualify an HREF to form a complete URI
DustMeSelectors_tools.qualifyHREF = function(href)
{
	//use spider or regular browser document, as applicable
	if(typeof DustMeSelectors_spider != 'undefined')
	{
		var doc = DustMeSelectors_spider.browser.contentDocument;
	}
	else
	{
		doc = DustMeSelectors.document;
	}

	//get the document location href
	var here = doc.location.href;

	//look for a base element to use instead
	var bases = doc.getElementsByTagName('base');
	if(bases.length > 0)
	{
		var basehref = bases[0].getAttribute('href');
		if(basehref && basehref != '')
		{
			here = basehref;
		}
	}

	//if the context argument is present and non-empty string, use that instead
	if(typeof context == 'string' && context != '')
	{
		here = context;
	}

	//extract the protocol, host and path
	//and create a location object with the data
	var parts = here.replace('//', '/').split('/');
	var loc = {
		'protocol' : parts[0],
		'host' : parts[1]
		}
	parts.splice(0, 2);
	loc.pathname = '/' + parts.join('/');

	//build a base URI from the protocol plus host (which includes port if applicable)
	var uri = loc.protocol + '//' + loc.host;

	//if the input path is relative-from-here
	//just delete the ./ token to make it relative
	if(/^(\.\/)([^\/]?)/.test(href))
	{
		href = href.replace(/^(\.\/)([^\/]?)/, '$2');
	}

	//if the input href is already qualified, copy it unchanged
	if(/^([a-z]+)\:\/\//.test(href))
	{
		uri = href;
	}

	//or if the input href begins with a leading slash, then it's base relative
	//so just add the input href to the base URI
	else if(href.substr(0, 1) == '/')
	{
		uri += href;
	}

	//or if it's an up-reference we need to compute the path
	else if(/^((\.\.\/)+)([^\/].*$)/.test(href))
	{
		//get the last part of the path, minus up-references
		var lastpath = href.match(/^((\.\.\/)+)([^\/].*$)/);
		lastpath = lastpath[lastpath.length - 1];

		//count the number of up-references
		var references = href.split('../').length - 1;

		//get the path parts and delete the last one (this page or directory)
		var parts = loc.pathname.split('/');
		parts = parts.splice(0, parts.length - 1);

		//for each of the up-references, delete the last part of the path
		for(var i=0; i<references; i++)
		{
			parts = parts.splice(0, parts.length - 1);
		}

		//now rebuild the path
		var path = '';
		for(i=0; i<parts.length; i++)
		{
			if(parts[i] != '')
			{
				path += '/' + parts[i];
			}
		}
		path += '/';

		//and add the last part of the path
		path += lastpath;

		//then add the path and input href to the base URI
		uri += path;
	}

	//otherwise it's a relative path,
	else
	{
		//calculate the path to this directory
		path = '';
		parts = loc.pathname.split('/');
		parts = parts.splice(0, parts.length - 1);
		for(var i=0; i<parts.length; i++)
		{
			if(parts[i] != '')
			{
				path += '/' + parts[i];
			}
		}
		path += '/';

		//then add the path and input href to the base URI
		uri += path + href;
	}

	//return the final uri
	return uri;
};



//parse a URL to form an object with all the 
//same properties as the native location object
DustMeSelectors_tools.parseURL = function(url)
{
    //create the location object and save the 
    //unmodified url to its initial href property
    var loc = { 'href' : url };

    //split the URL by single-slashes to get the component parts
    var parts = url.replace('//', '/').split('/');

    //store the protocol and host
    loc.protocol = parts[0];
    loc.host = parts[1];
    
    //extract any port number from the host
    //from which we derive the port and hostname
    //but wrap this in exception handling, so that we catch errors 
    //from trying to parse unknown pseduo-protocols
    //(eg. "mailto:" we know about and pre-exclude, 
    // but there might be others we don't know about which make it this far)
    try
    {
		parts[1] = parts[1].split(':');
		loc.hostname = parts[1][0];
		loc.port = parts[1].length > 1 ? parts[1][1] : '';
    }
    catch(err)
    {
    	//if we catch this return null for failure
    	return null;
    }

    //splice and join the remainder to get the pathname
    parts.splice(0, 2);
    loc.pathname = '/' + parts.join('/');

    //extract any hash and remove from the pathname
    loc.pathname = loc.pathname.split('#');
    loc.hash = loc.pathname.length > 1 ? '#' + loc.pathname[1] : '';
    loc.pathname = loc.pathname[0];

    //extract any search query and remove from the pathname
    loc.pathname = loc.pathname.split('?');
    loc.search = loc.pathname.length > 1 ? '?' + loc.pathname[1] : '';
    loc.pathname = loc.pathname[0];

    //return the final object
    return loc;
};




//get the favicon image for a potential URL
//calling-back the image URL, or null if we don't have one
//nb. the value could be any old junk, such as
//a partially-typed value in the sitemap URL textbox
//but may also be a valid typed URL or an autocomplete selection
//nb. we use a callback to allow for the asynchronous load process
DustMeSelectors_tools.getFavicon = function(str, load, callback)
{
	//try to create an IURI object from this string
	//and if that fails then the string is not a URI
	//so pass null to the callback to indicate that state, and we're done
	try 		{ var nsIURI = this.ioService.newURI(str, null, null);  }
	catch(ex)	
	{ 
		//*** DEV TMP
		//alert('BAD URI = "' + str + '"');
			
		return callback(null); 
	}

	//then pass that IURI object to the favicon service
	//to see if we already have a stored favicon for the URI in question
	//if we do then we'll get it as an IURI object, otherwise we'll get null
	PlacesUtils.favicons.getFaviconURLForPage(nsIURI, function(fsURI)
	{
		//so if we do have a favicon, get an icon link for it 
		//and pass that back through the top-level callback, and we're done
		if(fsURI !== null)
		{
			//*** DEV TMP
			//alert('EXISTING = "' + PlacesUtils.favicons.getFaviconLinkForIcon(fsURI).spec + '"');
			
			return callback(PlacesUtils.favicons.getFaviconLinkForIcon(fsURI).spec);
		}		
		
		//*** DEV TMP
		//alert('NO EXISTING');
		
		//else pass back the default, since we can't load new favicons 
		//for pages that are not already bookmarked or in the history 
		//but for any such pages we'll already have their favicon
		return callback('chrome://dustmeselectors/content/defaultFavicon.png');
	});
};





//remove duplicate items from an array
//by building a new array that rejects non-unique values
DustMeSelectors_tools.arrayUnique = function(ary)
{
	var newary = [];
	for(var i=0; i<ary.length; i++)
	{
		if(!this.arrayContains(newary, ary[i]))
		{
			newary.push(ary[i]);
		}
	}
	return newary;
};

//check whether an array contains a particular value
DustMeSelectors_tools.arrayContains = function(ary, val)
{
	for(var i=0; i<ary.length; i++)
	{
		if(ary[i] == val) { return true; }
	}
	return false;
};


//count an object's enumerable properties
DustMeSelectors_tools.count = function(obj)
{
	var count = 0;
	for(var i in obj)
	{
		if(obj.hasOwnProperty(i)) { count++; }
	}
	return count;
};


//format a number or numeric-string into comma-delimited thousands
DustMeSelectors_tools.format = function(value)
{
	var thousands = /([-]?[0-9]+)([0-9]{3})/;
	while(thousands.test((value = value.toString())))
	{
		value= value.replace(thousands, '$1,$2');
	}
	return value;
};




//save the size properties of a dialog
DustMeSelectors_tools.saveDialogProps = function(dialog, name)
{
	//create a properties string of the dialog size and position
	//that we can then use later to re-apply the save dimensions
	//nb. we record these manually because the persist attribute is unreliable
	var props = dialog.outerWidth + ',' + dialog.outerHeight + ',' + dialog.screenX + ',' + dialog.screenY;

	//set the data to preferences
	DustMeSelectors_preferences.setPreference('string', 'dialogs.' + name, props);
};

//get and apply stored dialog dimensions
DustMeSelectors_tools.applyDialogProps = function(dialog, name)
{
	//look for saved properties for this dialog
	var props = DustMeSelectors_preferences.getPreference('string', 'dialogs.' + name);

	//if we have data, parse it and apply the values to the dialog
	if(props !== '')
	{
		//parse the properties string
		props = props.split(',');
		
		//nb. don't apply dimensions to the preferences or spider dialogs
		//because they're not supposed to be resizable, but in case they are
		//(eg in most linux distros) then we want the default size to apply
		//afresh each time the dialog is opened, not save those changes 
		//and also because the spider dialog might have been closed in its 
		//expanded state, and we don't want to apply that size by default
		if(!(name == 'spiderdialog' || name == 'preferences'))
		{
			dialog.resizeTo(parseInt(props[0], 10), parseInt(props[1], 10));
		}

		//nb. only apply the screen position if we have those values 
		//for backward compatibility with when we didn't save that info
		if(props.length == 4)
		{
			dialog.moveTo(parseInt(props[2], 10), parseInt(props[3], 10));
		}
	}
};




//build and return an array of all open browser windows 
//which will be an empty array if there aren't any
DustMeSelectors_tools.getEveryWindow = function()
{
	var every = [];
	var enumerator = DustMeSelectors_tools.windowService.getEnumerator('navigator:browser');
	while(enumerator.hasMoreElements()) 
	{
		every.push(enumerator.getNext());
	}
	return every;
};





//the extension was originally written using custom JSON prototypes 
//but now that we only have to support FF3.5+ we can use native functions
//in fact we have to to get rid of the disallowed uses of eval()
//but to avoid too much retrofitting we'll keep the old parsing functions
//and just route them back to corresponding native functionality 
DustMeSelectors_tools.Object_toJSONString = function(obj)
{
	return JSON.stringify(obj);
};
DustMeSelectors_tools.String_parseJSON = function(str)
{
	return JSON.parse(str);
};




//get the APU speed from preferences, then limit to 10 and re-save if necessary
//then assign the value to tools.apuspeed, which is what the APU actually references
//and finally return the value for the convenience of the caller
DustMeSelectors_tools.apuspeedCreate = function()
{
	if((DustMeSelectors_tools.apuspeed = DustMeSelectors_preferences.getPreference('number', 'apuspeed')) < 10)
	{
		DustMeSelectors_preferences.setPreference('number', 'apuspeed', (DustMeSelectors_tools.apuspeed = 10));
	}
	return DustMeSelectors_tools.apuspeed;
};


//get the chunksize from preference, then limit to 1 and re-save if applicable
//then assign the value to tools.chunksize, which is what the APU actually references
//and finally return the value for the convenience of the caller
DustMeSelectors_tools.chunksizeCreate = function()
{
	if((DustMeSelectors_tools.chunksize = DustMeSelectors_preferences.getPreference('number', 'chunksize')) < 1)
	{
		DustMeSelectors_preferences.setPreference('number', 'chunksize', (DustMeSelectors_tools.chunksize = 1));
	}
	return DustMeSelectors_tools.chunksize;
};


//asynchronous processing-unit (APU2) abstraction
//nb. this is a more mature version of the APUs used in earlier versions
//(http://www.brothercake.com/site/resources/scripts/apu/)
DustMeSelectors_tools.APU2 = function(chunksize, oninstance, oncomplete, onabort)
{
	this.argument = function(value, fallback)
	{
		return (typeof value == 'number' && value >= 0 ? parseInt(value, 10) : fallback);
	};
	
	var 
	apu				= this, 
	timer			= null,
	chunk			= 0,
	chunksize		= (this.argument(chunksize, DustMeSelectors_tools.chunksize) || 1);
	
	this.i			= 0;
	this.stopped	= false;
	
	this.call = function(fn)
	{
		if(typeof fn == 'function')
		{
			fn.call(this, this.i);
		}
	};

	this.docomplete = function()
	{
		this.call(oncomplete);
	};

	this.doinstance = function(speed)
	{
		if(apu.i == 0)
		{ 
			this.call(oninstance);
		}
		else if((++ chunk) == chunksize)
		{
			chunk = 0; 
			timer = window.setTimeout(function()
			{
				apu.call(oninstance);
		
			}, DustMeSelectors_tools.apuspeed);
		}
		else
		{ 
			this.call(oninstance);
		}
	};

	this.doabort = function()
	{
		window.clearTimeout(timer);
		
		this.call(onabort);
	};
}
DustMeSelectors_tools.APU2.prototype =
{
	start : function()
	{
		this.i = 0;
		this.stopped = false;
		
		this.doinstance();
	},
	next : function(increment, speed)
	{
		if(this.stopped) { return; }

		this.i += this.argument(increment, 1);
		this.doinstance();
	},
	complete : function()
	{
		if(this.stopped) { return; }

		this.stopped = true;
		this.docomplete();
	},
	abort : function()
	{
		if(this.stopped) { return; }

		this.stopped = true;
		this.doabort();
	}
};



