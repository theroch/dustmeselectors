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


//dust-me selectors spider object
var DustMeSelectors_spider = new Object();

//spider timer reference
DustMeSelectors_spider.spidertimer = null;



//when the chrome has loaded
window.addEventListener('load', function()
{
	
	//size the window to match its default content
	DustMeSelectors_spider.shrinkToContent();
	

	//initialize the data saving options
	DustMeSelectors_tools.initialiseDataSavingOptions();

	//if there's no data in the hosts index, disable the view button
	if(DustMeSelectors_tools.getHostsIndex().length == 0)
	{
		DustMeSelectors_spider.setUIState('view', true);
	}
	
	
	//create a logsaved property that indicates whether the current spider log has been saved
	//because it doesn't get saved until we've finished checking the first page, 
	//so we check this flag in the pause function to tell us whether to 
	//show the continue button (if it's true) or the start button (if it's false)
	DustMeSelectors_spider.logsaved = false;

	//build the array of all the sitemap URLs we known about
	DustMeSelectors_spider.buildSitemaps();

	//save a reference to the dialog browser element
	DustMeSelectors_spider.browser = document.getElementById('dms-spider-browser');

	
	//now bind an oninput listener to the sitemap URL textbox 
	//to capture all input - whether values we've set, 
	//user typed or pasted info, or auto-complete input 
	var mapinput = document.getElementById('dms-spider-mapurl');
	mapinput.addEventListener('input', function()
	{
		//ignore this event entirely if the spider is currently running
		if(!DustMeSelectors.running)
		{
			//if the value contains any whitespace, strip it and write the value back
			if(/\s/.test(mapinput.value))
			{
				mapinput.value = mapinput.value.replace(/\s/g, '');
			}
				
			//reset the favicon image back to default
			mapinput.style.listStyleImage = 'url(chrome://dustmeselectors/content/defaultFavicon.png)';
			
			//check the value to see if it's a sitemap URL we know about
			//=> if it is and it hasn't been fully spidered yet, show the "resume" button;
			//=> or if it is and it's already been fully spidered, show the "repeat" button;
			//=> otherwise show the "go" button 
			//nb. the isSitemapURI function returns a numeric key
			//that we can pass to setUIState to set the appropriate state
			DustMeSelectors_spider.setUIState(
				'urlgroup', 
				DustMeSelectors_spider.isSitemapURI(mapinput.value)
				);
		}
	}, false);
	

}, false);



//build a dictionary of all the sitemaps we know about 
//from the hostsindex object in the opener instance
//indexed by URI, and storing a flag that indicates whether they've been fully spidered
DustMeSelectors_spider.buildSitemaps = function()
{
	var hostsindex = opener.DustMeSelectors_tools.hostsindex;
	this.sitemaps = {};
	for(var i in hostsindex)
	{
		if(!hostsindex.hasOwnProperty(i)) { continue; }
		
		if(typeof hostsindex[i].sitemap != 'undefined')
		{	
			this.sitemaps[encodeURIComponent(hostsindex[i].sitemap)] = (typeof hostsindex[i].spidered != 'undefined');
		}
	}
};

//test whether a string exactly matches one of the sitemaps
//and return a value that we can pass to the UIState function for the spider buttons
//=> return 3 if it matches AND it's fully spidered
//=> return 2 if it matches but it's incompletely spidered
//=> return 0 if it doesn't match at all
DustMeSelectors_spider.isSitemapURI = function(str)
{
	for(var i in this.sitemaps)
	{
		if(!this.sitemaps.hasOwnProperty(i)) { continue; }
		
		if(str === decodeURIComponent(i))
		{
			return this.sitemaps[i] ? 3 : 2;
		}
	}
	return 0;
};






//menu command function: spider sitemap
DustMeSelectors_spider.spiderSitemap = function(sitemapurl, noconfirm)
{
	//***DEV (prefil the mapurl input value to a local test sitemap)
	//document.getElementById('dms-spider-mapurl').value = 
	//	//'http://cakebook/clients/sitepoint/dustmeselectors/_dev/spiderpages/test.html';
	//	'http://cakebook.local/projects/dustmeselectors/_dev/spiderpages/test.xml';
	
	
	//if the input sitemap URL is undefined or null
	//nb. which it will be in most cases, except for 
	//when we're loading single sitemaps from a sitemap index
	if(typeof sitemapurl === 'undefined' || sitemapurl === null)
	{
		//delete any existing sitemapindex array
		delete this.sitemapindex;
		
		//save a reference to the mapinput, then strip its value of whitespace 
		//and write it back to the input, then save the resulting value
		//nb. even though we do this oninput, that doesn't happen if the spider is running
		//so this provides a final stage removal of any last possible whitespace
		var mapinput = document.getElementById('dms-spider-mapurl');
		this.mapurl = mapinput.value = mapinput.value.replace(/\s/g, '');
	
		//if the value is empty, do nothing
		if(this.mapurl == '') { return; }
	
		//if it doesn't have a protocol, add http
		//then write the modified value back to the input
		if(!/^([a-z]+\:\/\/)/i.test(this.mapurl))
		{
			mapinput.value = this.mapurl = 'http://' + this.mapurl;
		}
		
		//we can't load sitemaps from the local filesystem using Ajax 
		//so if the mapurl protocol begins with "file:"
		//report the "not networked" error and we're done
		if(/^file\:/i.test(this.mapurl))
		{
			//NOTE FOR REVIEWERS: the query value will never contain a remote URI
			window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
				+ encodeURI(DustMeSelectors_tools.bundle.getString('error.notnetworked')),
				'errdialog', 'chrome,centerscreen,modal,resizable=no');
			return;
		}
	
		//update the mapurl persistence preference
		//nb. and it's simplest to do this whether or not 
		//spiderpersist is enabled, then only apply it to the mapinput if so
		DustMeSelectors_preferences.setPreference('string', 'mapurl', this.mapurl);
	
	
		//then if the noconfirm argument is undefined or false
		//which it will be when this function is called from spider buttons
		//or the textbox key handler, but not when called programaticaly
		//from the resite or respider dialog, so it doens't ask for confirmation again
		if(typeof noconfirm === 'undefined' || noconfirm === false)
		{
			//we already know that we haven't got data for this exact sitemap
			//otherwise the "spider again" button would have triggered the spiderAgain function
			//but we might have spidered another sitemap on the same site, or we might 
			//have scanning data for the site without having spidered it all all 
			//so, get the hostsindex object and create the preference name for this sitemap URL
			var hostsindex = opener.DustMeSelectors_tools.hostsindex;
			var maphost = DustMeSelectors_tools.getSelectorsDataPreferenceName(this.mapurl);
			
			//then if the sitemap host is already listed in the hostsindex
			for(var i in hostsindex)
			{
				if(hostsindex.hasOwnProperty(i))
				{
					if(hostsindex[i].host == maphost)
					{
						//if this site has already been spidered then show the spider dialog
						if(typeof hostsindex[i].spidered != 'undefined')
						{
							window.openDialog('chrome://dustmeselectors/content/respider.xul', 'respider', 'chrome,centerscreen,modal,resizable=no');
						}
						
						//otherwise show the resite dialog, which ultimately does the same thing
						//of either trashing stored data, or not, before spidering the sitemap
						//but the wording is different to reflect its more common appearance
						else
						{
							window.openDialog('chrome://dustmeselectors/content/resite.xul', 'respider', 'chrome,centerscreen,modal,resizable=no');
						}
						
						//then we're done here
						return;
					}
				}
			}
		}			
	
	
		//***DEV
		//this.benchmarkStart = new Date().getTime();
	
		//check the preferences for allowed mime-types
		//then set default values for each that's not defined
		for(var key in DustMeSelectors_preferences.mimetypes)
		{
			if(DustMeSelectors_preferences.mimetypes.hasOwnProperty(key))
			{
				if(DustMeSelectors_preferences.getPreference('string', 'mimetypes.' + key) == '')
				{
					DustMeSelectors_preferences.setPreference
						('string', 'mimetypes.' + key, DustMeSelectors_preferences.mimetypes[key]);
				}
			}
		}
		
		//now set the running property 
		DustMeSelectors.running = true;
	
		//initialize the progress indicator
		this.setUIState('progress-init');
	
		//show the group of find status icons in the statusbar
		this.setUIState('statusicons', false);
	
		//show the spider statusbar
		this.setUIState('statusbar', false);
	
	
		//disable the URL group elements
		//for the "urlgroup" command this function also
		//returns a reference to the button that's now visible ...
		var userbutton = this.setUIState('urlgroup', 1);
		
		//... because hiding a button that has the focus, loses the user focus, 
		//so we should set it back on the now-visible button
		userbutton.focus();
		
		
		//reset the logsaved flag
		this.logsaved = false;
	}	
	
	
	//set the current url connecting icon
	this.setUIState('connectingurl', true);


	//***DEV LATENCY
	//setTimeout(function(){ 
	

	//now establish the status of the file
	//by making an XHR request for it
	var request = new XMLHttpRequest();

	//when it completes
	request.onreadystatechange = function()
	{
		//when the ready state changes to 2 (headers received)
		if(request.readyState == 2)
		{
			//set the current url loading icon
			//but surround it with a test for the spider object
			//to avoid console errors if the dialog is closed mid-request
			if(typeof DustMeSelectors_spider != 'undefined')
			{
				DustMeSelectors_spider.setUIState('loadingurl', true);
			}
		}
		
		//when the request is complete
		if(request.readyState == 4)
		{
			//***DEV LATENCY
			//setTimeout(function(){ 
			
			
			//do this on a try catch to handle errors
			//in case we get NS_ERROR_NOT_AVAILABLE
			try
			{
				//for successful requests we can continue
				if(/^(200|304)$/.test(request.status))
				{
					//get the response mime-type, and split to to remove any character encoding
					var mimetype = request.getResponseHeader('Content-Type').split(';')[0];

					//check the document content type against the list of allowed sitemap types,
					//(lowercasing both values just in case), but if they don't match 
					if(DustMeSelectors_preferences.getPreference
						('string', 'mimetypes.sitemap').toLowerCase().indexOf(mimetype.toLowerCase()) < 0)
					{
						//clear the running property
						DustMeSelectors.running = false;

						//hide the spider statusbar
						DustMeSelectors_spider.setUIState('statusbar', true);

						//re-enable the URL group elements, and focus the "go" button
						DustMeSelectors_spider.setUIState('urlgroup', 0).focus();

						//report the "not sitemap" error
						//NOTE FOR REVIEWERS: the query value will never contain a remote URI
						window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
							+ encodeURI(DustMeSelectors_tools.bundle.getString('error.notsitemap')),
							'errdialog', 'chrome,centerscreen,modal,resizable=no');
					}

					//otherwise we're good
					else
					{
						//if we loaded an XML sitemap then we'll have a responseXML
						//so we can pass that DOM directly to the parseSitemap function
						//nb. this means that if the document was XML but returned as HTML 
						//it would be treated as an HTML document and parsed accordingly 
						//but the reason for having this difference is so that documents 
						//which are XML but have a default rendering in Firefox (such as RSS)
						//will be treated as XML, not as the HTML the browser document would contain
						//which ultimately means we're able to verify and spider sitemaps as RSS 
						if(request.responseXML)
						{
							DustMeSelectors_spider.parseSitemap(request.responseXML);
						}
						
						//else proceed to load the document into the spider browser
						else
						{
							//disable [or re-enable] javascript in the browser, 
							//according to the nospiderjs preference
							DustMeSelectors_spider.browser.docShell.allowJavascript = !DustMeSelectors_preferences.getPreference('boolean', 'nospiderjs');
							
							//bind a domready handler to the browser to parse the sitemap
							DustMeSelectors_spider.browser.addEventListener('DOMContentLoaded',
								DustMeSelectors_spider.parseSitemap, false);
	
							//then load the sitemap document into the browser 
							//using the bypass-cache flag (equivalent to force-reload)
							//** nb. I haven't been able to confirm that this works 
							//** cos I can't get it to used cached pages in the first place!
							//** but it definitely has happened before, and this definitely
							//** should prevent it, so let's just see how it goes eh!
							//nb. specify the sitemap URL as the referer, just so 
							//we don't have problems with pages that don't display 
							//any content when there's no referer information
							//but we don't need to specify a charset, we can just let 
							//the browser infer that, and obviously we don't need post data
							DustMeSelectors_spider.browser.loadURIWithFlags(
								DustMeSelectors_spider.mapurl, 
								DustMeSelectors_spider.browser.webNavigation.LOAD_FLAGS_BYPASS_CACHE, 
								DustMeSelectors_tools.ioService.newURI(DustMeSelectors_spider.mapurl, null, null), 
								null, null);
						}
					}
				}

				//for errors
				else
				{
					//clear the running property
					DustMeSelectors.running = false;

					//hide the spider statusbar
					DustMeSelectors_spider.setUIState('statusbar', true);

					//re-enable the URL group elements, and focus the "go" button
					DustMeSelectors_spider.setUIState('urlgroup', 0).focus();

					//report the error
					//passing the text in the query string seems a bit hacky to me
					//i wanted to monitor the dialog load event and then append the data in the DOM
					//but that didn't work (load didn't fire), so instead, I do this
					//then in the dialog itself a load function splits out the data
					//and appends it to the description element directly
					//nb. the statusText will be empty if the request returned no HTTP information
					//such as an unavailable URL, hence we output the notaccessible error
					//otherwise we output an XHR error with the status info as part of the message
					if(request.statusText == '') 
					{
						var errormsg = DustMeSelectors_tools.bundle.getString('error.notaccessible'); 
					}
					else
					{ 
						errormsg = DustMeSelectors_tools.bundle.getString('error.xhr')
							.replace('%1', request.status + ' ' + request.statusText);
					}
					//NOTE FOR REVIEWERS: the query value will never contain a remote URI
					window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
						+ encodeURI(errormsg),
						'errdialog', 'chrome,centerscreen,modal,resizable=no');
				}
			}
			catch(ex)
			{
				//surround this with a test for the spider object
				//to avoid console errors if the dialog is closed mid-request
				if(typeof DustMeSelectors_spider != 'undefined')
				{
					//clear the running property
					DustMeSelectors.running = false;

					//hide the spider statusbar
					DustMeSelectors_spider.setUIState('statusbar', true);
	
					//re-enable the URL group elements, and focus the "go" button
					DustMeSelectors_spider.setUIState('urlgroup', 0).focus();
	
					//report the "not accessible" error
					//NOTE FOR REVIEWERS: the query value will never contain a remote URI
					window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
						+ encodeURI(DustMeSelectors_tools.bundle.getString('error.notaccessible')),
						'errdialog', 'chrome,centerscreen,modal,resizable=no');
				}
			}

	
			//***DEV LATENCY
			//}, Math.random() * 2000); 
		}
	};

	//save a local shortcut to the request URL 
	//using the input argument if defined, or the spider mapurl if not
	//and then add a timestamp query-string we so never get a cached response 
	//(which is handled with loadURIWithFlags for browser-loaded sitemaps (ie. non-XML))
	var geturl = (geturl = (sitemapurl || DustMeSelectors_spider.mapurl))
				+ (geturl.indexOf('?') < 0 ? '?' : '&') 
				+ 'dustmeselectors=' + Date.now();

	//now try make an aysnchronous request for the URL, handling any exception
	//(which we need to do in case of malformed URLs or connection failure)
	//nb. we have to use a GET request irrespective of the "verifyhead" preference
	//because we'll need the responseXML if the document is an XML sitemap 
	//** or could we establish that first and then use HEAD if we know it's not XML?
	//** but how can we do that when the file-extension is not a reliable test 
	//** (eg. it might be generated XML with a php extension or a clean URL)
	try
	{
		request.open('GET', geturl, true);
		request.send(null);
	}
	catch(ex)
	{
		//surround this with a test for the spider object
		//to avoid console errors if the dialog is closed mid-request
		if(typeof DustMeSelectors_spider != 'undefined')
		{
			//clear the running property
			DustMeSelectors.running = false;

			//hide the spider statusbar
			DustMeSelectors_spider.setUIState('statusbar', true);
	
			//re-enable the URL group elements, and focus the "go" button
			DustMeSelectors_spider.setUIState('urlgroup', 0).focus();
	
			//report the "not accessible" error
			//NOTE FOR REVIEWERS: the query value will never contain a remote URI
			window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
				+ encodeURI(DustMeSelectors_tools.bundle.getString('error.notaccessible')),
				'errdialog', 'chrome,centerscreen,modal,resizable=no');
		}
	}

	
	//***DEV LATENCY
	//}, Math.random() * 2000); 
};



//parse a sitemap, creating or updating the array of spider locations
DustMeSelectors_spider.parseSitemap = function(data, locations)
{
	//if the running flag is false, do nothing 
	//which is just in case you press pause while it's still connecting
	//to stop the subsequent about:blank loading from triggering this 
	if(!DustMeSelectors.running) { return; }
	
	
	//if the data argument is a document 
	//then it's the responseXML DOM passed by ajax verification
	if(data instanceof Document)
	{
		//save a reference to the document
		var doc = data;
	}
	
	//else it must be a DOMContentLoaded event from the spider browser document
	else
	{
		//the event might not be coming from the main browser document
		//it can also bubble up from embedded iframes, most likely ad frames 
		//and if one of them fires first before the main document is ready 
		//the spider will find no links to spider and hence return "no crawlable links"
		//so, ignore this event if the target document doesn't match the browser document
		if(DustMeSelectors_spider.browser.contentDocument !== data.originalTarget) { return; }
		
		//remove the browser domready handler immediately
		//to avoid the possibility of it firing more than once
		//which could ultimately give rise to log reference errors
		//** though that shouldn't happen anymore now we have the target filter
		DustMeSelectors_spider.browser.removeEventListener('DOMContentLoaded', 
			DustMeSelectors_spider.parseSitemap, false);

		//save a reference to the browser document
		var doc = DustMeSelectors_spider.browser.contentDocument;
	}


	//save a reference to the sitemap URL textbox
	var mapinput = document.getElementById('dms-spider-mapurl');


	//if the global sitemapindex array is undefined, then this is 
	//either a normal (single) sitemap, or the sitemap index itself
	//nb. if it is defined we don't do any history or redirection stuff
	//(because we don't currently log the URLs of individual sitemaps)
	//and we'll already have a locations array to add individual URLs to
	if(typeof DustMeSelectors_spider.sitemapindex === 'undefined')
	{
		//save a shortcut to the documentURI, parsed of any timestamp query
		//(that we add to ajax requests so we don't get cached XML sitemaps)
		//nb. using documentURI because it's available for all documents 
		//as opposed to doc.location which an XML response DOM won't have
		var docuri = doc.documentURI.replace(/[\&\?]dustmeselectors=[\d]+/, '');
			
		//then if the URI is different from the saved mapurl
		//by more than just a trailing slash (eg. it's a domain level redirect)
		//and/or by the addition of "www." (eg. you typed the url without it)
		//then create a sourceurl for the log with the original typed URL
		//so we can then output the original URL as a note in the viewdata's h2;
		//or if that's not the case leave sourceurl as null for later reference
		//nb. this will include redirections to https because I think they're worth logging
		DustMeSelectors_spider.sourceurl = null;
		if(DustMeSelectors_spider.mapurl != docuri)
		{
			if(DustMeSelectors_spider.mapurl.replace(/\/$/, '').replace(/^([a-z]:\/\/)www\./, '$1') 
					!= 
					docuri.replace(/\/$/, '').replace(/^(http:\/\/)(www\.)?/, '$1'))
			{
				DustMeSelectors_spider.sourceurl = DustMeSelectors_spider.mapurl;
			}
		}
		
		//then update the mapurl with the document URI, and write it back to its textbox
		//nb. we do this in either case, in case it has been updated by only a trailing slash
		mapinput.value = DustMeSelectors_spider.mapurl = docuri;
	
	
		//try to get a favicon for the sitemap URL 
		//passing true for the load argument so that if we don't already
		//have the favicon in the local store, it will try to 
		//load it from the host site and then save that to the local store 
		//nb. if we do already have it then it will already have been loaded 
		//by the mapinput ontextentered event, so there is some redundency here
		//but we still need this in case we have to load it, and we still need
		//that one so the favicon updates in response to automcomplete selection
		DustMeSelectors_tools.getFavicon(DustMeSelectors_spider.mapurl, true, function(favicon)
		{
			//so when that process completes we'll get a custom or default favicon
			//ie custom if the site has a favicon, or default if it doesn't 
			//or the process times-out or private browsing mode is enabled
			//(unless we get null for an invalid URL, which won't happen, but JiC!)
			//so apply that favicon image to the mapinput's list-style-image
			if(favicon)
			{
				mapinput.style.listStyleImage = 'url(' + favicon + ')';
			}
		});
	
	
		//create (or reset) the array for storing location URLs
		DustMeSelectors_spider.locations = [];
	}
	
	
	//now look for the root element, and if we don't find one 
	//or if it isn't a document type the spider supports
	//=> "sitemapindex" for an XML sitemap index
	//=> "urlset" for an XML sitemap
	//=> "rss" for an RSS feed
	//=> "html" for an HTML page
	//nb. we shouldn't get this far without a root, but check anyway
	var docname, docnode = doc.documentElement;
	if(!docnode || !/^(sitemapindex|urlset|rss|html)$/.test(docname = docnode.nodeName.toLowerCase()))
	{
		//clear the running property
		DustMeSelectors.running = false;

		//empty the browser
		DustMeSelectors_spider.browser.loadURI('about:blank', null, null);

		//clear the current url loading icon
		DustMeSelectors_spider.setUIState('loadingurl', false);
		
		//hide the spider statusbar
		DustMeSelectors_spider.setUIState('statusbar', true);

		//re-enable the URL group elements, and focus the "go" button
		DustMeSelectors_spider.setUIState('urlgroup', 0).focus();

		//report the "not sitemap" error
		//NOTE FOR REVIEWERS: the query value will never contain a remote URI
		window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
			+ encodeURI(DustMeSelectors_tools.bundle.getString('error.notsitemap')),
			'errdialog', 'chrome,centerscreen,modal,resizable=no');
			
		//then we're done
		return;
	}
	
	//else if the document is an XML sitemap or sitemap index
	else if(docname == 'sitemapindex' || docname == 'urlset')
	{
		//look for <loc> elements in the target document
		//nb. since we've already checked the document element 
		//we don't really need to check these elements' context 
		//(ie. being inside a <url> or <sitemap> element)
		var locs = doc.getElementsByTagName('loc');

		//then iterate through the collection and extract their node values
		for(var len = locs.length, i = 0; i < len; i ++)
		{
			//check the node isn't empty
			if(locs[i].firstChild)
			{
				//copy and trim the value, then remove any fragment identifier from the URI
				var uri = locs[i].firstChild.nodeValue.replace(/^\s+|\s+$/g, '').split('#')[0];
				
				//just in case it's empty or only whitespace
				if(!/\S/.test(uri)) { continue; }
	
				//else get the effective host for this link
				//and if it's empty, this must be either a local file:// address 
				//or it has a pseudo-protocol like abaout, javascript or mailto 
				//(accounting for ignoreports and ignoresubdomains)
				if(DustMeSelectors_tools.getEffectiveHost(uri) == '') { continue; }
	
				//add it to the locations array
				//nb. we don't refer to the "noexternal" parameter when checking sitemap XML
				//only when checking HTML pages; it's likely that ignoring external links 
				//was the reason why this failed for some people, if they're loading a sitemap
				//on their local dev server that points to pages on their live site
				//and after all -- why would your XML sitemap include links you don't want to include..?
				//(whereas an HTML sitemap might just be a normal page, not explicitly a sitemap)
				DustMeSelectors_spider.locations.push(uri);
			}
		}

		//then if we didn't find any links 
		//nb. we do this after iteration rather than testing locs.length at the start
		//in case there were <url> elements but they were all empty or had empty <loc> elements
		//and we never want to show the "no good links" error after spidering an XML sitemap
		//because the noexternal and nofollow preferences don't apply to them
		//nb. this will happen if the first sitemap in an index has no links 
		//causing the entire spidering operation to be abandoned
		if(DustMeSelectors_spider.locations == 0)
		{
			//clear the running property
			DustMeSelectors.running = false;
	
			//empty the browser
			DustMeSelectors_spider.browser.loadURI('about:blank', null, null);
	
			//clear the current url loading icon
			DustMeSelectors_spider.setUIState('loadingurl', false);
			
			//hide the spider statusbar
			DustMeSelectors_spider.setUIState('statusbar', true);
	
			//re-enable the URL group elements, and focus the "go" button
			DustMeSelectors_spider.setUIState('urlgroup', 0).focus();
	
			//report the "no links" error
			//NOTE FOR REVIEWERS: the query value will never contain a remote URI
			window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
				+ encodeURI(DustMeSelectors_tools.bundle.getString('error.nolinks')),
				'errdialog', 'chrome,centerscreen,modal,resizable=no');
		
			//then we're done
			return;
		}
		
		//else if the document is an XML sitemap index 
		//and the sitemap index array isn't already defined 
		//nb. which we check in case a sitemap index loads another index
		//and if that happens we'll effecitvely ignore it, so all its 
		//location URLs will get added to the array like normal pages 
		//and then when they're spidered they'll be logged as invalid mime-types
		//nnb. this will equally handle the sitemap index loading itself 
		//and the use of arrayUnique means we won't get multiple recursions of that
		//nb. if the sitemap index loads an HTML sitemap, then it will be spidered 
		//as normal, but we'll also break index iteration from that point onwards, 
		//which means that everything in the index will be added to the locations array, 
		//and ultimately listed in the spider log with an invalid mime-type error
		//** not sure I understand why it works out that way, but it's no biggy!
		else if(docname == 'sitemapindex' && typeof DustMeSelectors_spider.sitemapindex === 'undefined')
		{
			//the locations array will be a list of individual sitemap URLs
			//so copy each of thsoe URLs to a separate global sitemapindex array
			DustMeSelectors_spider.sitemapindex = [];
			for(var len = DustMeSelectors_spider.locations.length, i = 0; i < len; i ++)
			{
				DustMeSelectors_spider.sitemapindex.push(DustMeSelectors_spider.locations[i]);
			}
	
			//remove any duplicate items 
			DustMeSelectors_spider.sitemapindex = DustMeSelectors_tools.arrayUnique(DustMeSelectors_spider.sitemapindex);
			
			//then clear the locations array, ready for page URLs
			DustMeSelectors_spider.locations = [];
			
			//now pass the first sitemap URL back to the spiderSitemap function
			DustMeSelectors_spider.spiderSitemap(DustMeSelectors_spider.sitemapindex.shift());
		
			//and we're done here for now
			return;
		}
		
		//else if the sitemapindex array is already defined 
		//then this is a single XML sitemap within that index
		//so the locations we've found this time will have been added 
		//to the existing locations array that we defined with the index
		//*** is there any possibility of this iterating forever?
		else if(typeof DustMeSelectors_spider.sitemapindex !== 'undefined')
		{
			//if we still have more sitemap URLs to load from the index
			if(DustMeSelectors_spider.sitemapindex.length > 0)
			{
				//pass [what's now the] first sitemap URL back to spiderSitemap
				//nb. then this will recur for as long as we have any to check
				DustMeSelectors_spider.spiderSitemap(DustMeSelectors_spider.sitemapindex.shift());
			
				//and we're done here for now
				return;
			}
			
			//otherwise we're done with the sitemapindex array, so delete it
			//nb. then the rest of this function can proceed as normal 
			//but with with an aggregated array of locations from all the sitemaps
			else
			{
				delete DustMeSelectors_spider.sitemapindex;
			}
		}
	}
	
	//else if the document is an RSS feed
	else if(docname == 'rss')
	{
		//look for <link> elements in the target document
		//nb. since we've already checked the document element 
		//we don't really need to check these elements' context 
		//and this means that we'll include the top-level link 
		//as well as all the links that are inside <item> elements
		var locs = doc.getElementsByTagName('link');

		//then iterate through the collection and extract their node values
		for(var len = locs.length, i = 0; i < len; i ++)
		{
			//check the node isn't empty
			if(locs[i].firstChild)
			{
				//copy and trim the value, then remove any fragment identifier from the URI
				var uri = locs[i].firstChild.nodeValue.replace(/^\s+|\s+$/g, '').split('#')[0];
				
				//just in case it's empty or only whitespace
				if(!/\S/.test(uri)) { continue; }
	
				//else get the effective host for this link
				//and if it's empty, this must be either a local file:// address 
				//or it has a pseudo-protocol like abaout, javascript or mailto 
				//(accounting for ignoreports and ignoresubdomains)
				if(DustMeSelectors_tools.getEffectiveHost(uri) == '') { continue; }
	
				//add it to the locations array
				DustMeSelectors_spider.locations.push(uri);
			}
		}

		//then if we didn't find any links 
		if(DustMeSelectors_spider.locations == 0)
		{
			//clear the running property
			DustMeSelectors.running = false;
	
			//empty the browser
			DustMeSelectors_spider.browser.loadURI('about:blank', null, null);
	
			//clear the current url loading icon
			DustMeSelectors_spider.setUIState('loadingurl', false);
			
			//hide the spider statusbar
			DustMeSelectors_spider.setUIState('statusbar', true);
	
			//re-enable the URL group elements, and focus the "go" button
			DustMeSelectors_spider.setUIState('urlgroup', 0).focus();
	
			//report the "no links" error
			//NOTE FOR REVIEWERS: the query value will never contain a remote URI
			window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
				+ encodeURI(DustMeSelectors_tools.bundle.getString('error.nolinks')),
				'errdialog', 'chrome,centerscreen,modal,resizable=no');
		
			//then we're done
			return;
		}
	}	

	//else it must be an HTML page
	else
	{
		//look for <a> elements in the target document
		var len, locs = doc.getElementsByTagName('a');
		
		//but if there aren't any
		if((len = locs.length) == 0)
		{
			//clear the running property
			DustMeSelectors.running = false;
	
			//empty the browser
			DustMeSelectors_spider.browser.loadURI('about:blank', null, null);
	
			//clear the current url loading icon
			DustMeSelectors_spider.setUIState('loadingurl', false);
			
			//hide the spider statusbar
			DustMeSelectors_spider.setUIState('statusbar', true);
	
			//re-enable the URL group elements, and focus the "go" button
			DustMeSelectors_spider.setUIState('urlgroup', 0).focus();
	
			//report the "no links" error
			//NOTE FOR REVIEWERS: the query value will never contain a remote URI
			window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
				+ encodeURI(DustMeSelectors_tools.bundle.getString('error.nolinks')),
				'errdialog', 'chrome,centerscreen,modal,resizable=no');
		
			//then we're done
			return;
		}

		//else get the noexternal and nofollow preferences
		var noexternal = DustMeSelectors_preferences.getPreference('boolean', 'noexternal');
		var nofollow = DustMeSelectors_preferences.getPreference('boolean', 'nofollow');
		
		//pre-save the effective hostname for the sitemap URL 
		//(accounting for ignoreports and ignoresubdomains)
		var maphost = DustMeSelectors_tools.getEffectiveHost(DustMeSelectors_spider.mapurl);
	
		//then if nofollow is true, get the relcondition, relattr and relvalues 
		//preferences, splitting relvalues into an array by its commas
		//nb. pre-filter all of them and re-save if necessary, 
		//restoring the default if the result of that is empty, just in case 
		//the user has edited them in about:config with illegal values
		if(nofollow)
		{
			var relcondition = DustMeSelectors_preferences.getPreference('string', 'relcondition');
			if(!/^(not)?contains$/.test(relcondition))
			{
				DustMeSelectors_preferences.setPreference('string', 'relcondition', 
					(relcondition = 'contains'));
			}
			
			var relattr = DustMeSelectors_preferences.getPreference('string', 'relattr');
			if(relattr == '' || (/([^-,a-z0-9])/.test(relattr)))
			{
				DustMeSelectors_preferences.setPreference('string', 'relattr', 
					(relattr = (
						(relattr = relattr.replace(/([^-,\w])/g, '').toLowerCase()) == ''
						? DustMeSelectors_preferences.defaults['relattr']
						: relattr
					))
				); 
			}
	
			var relvalues = DustMeSelectors_preferences.getPreference('string', 'relvalues');
			if(relvalues == '' || (/([^-,a-z0-9])/.test(relvalues)))
			{
				DustMeSelectors_preferences.setPreference('string', 'relvalues', 
					(relvalues = (
						(relvalues = relvalues.replace(/([^-,\w])/g, '').toLowerCase()) == ''
						? DustMeSelectors_preferences.defaults['relvalues']
						: relvalues
					))
				); 
			}
			relvalues = relvalues.split(',');
		}
		
		//then iterate through the collection and extract their href attributes
		for(var i = 0; i < len; i ++)
		{
			//exclude anchors with no href
			if(!locs[i].href) { continue; }

			//copy and trim the value, then remove any fragment identifier from the URI
			var uri = locs[i].href.replace(/^\s+|\s+$/g, '').split('#')[0];

			//just in case it's empty or only whitespace
			if(!/\S/.test(uri)) { continue; }

			//else get the effective host for this link
			//(accounting for ignoreports and ignoresubdomains)
			var linkhost = DustMeSelectors_tools.getEffectiveHost(uri);
			
			//then if it's empty, this must be either a local file:// address 
			//or it has a pseudo-protocol like about, javascript or mailto 
			if(linkhost == '') { continue; }
			
			//else if noexternal is true and the linkhost is not 
			//the same as the maphost, it's an external link 
			if(noexternal && linkhost != maphost) { continue; }
			
			//then if nofollow is true
			if(nofollow)
			{
				//pre-save the [relattr] attribute value from this link
				//and define a flag to indicate whether it matches 
				//any of the relvalue conditions and should be filtered out
				var 
				filter = false, 
				attrval = locs[i].getAttribute(relattr);
				
				//if the attr is null or empty then it obviously can't match
				//so there's no need to proceed with the test conditions
				if(!(attrval === null || attrval === ''))
				{
					//else iterate through the relvalues, and if any of them 
					//match the attribute value, set the filter flag and break
					for(var v=0; v<relvalues.length; v++)
					{
						if(new RegExp('(^|[ \t])' + relvalues[v] + '([ \t]|$)', 'i').test(attrval))
						{
							filter = true;
							break;
						}
					}
				}
				
				//that logic assumes that the relcondition is "contains"
				//if it's "notcontains" then the opposite is true, so invert the flag
				if(relcondition == 'notcontains')
				{
					filter = !filter;
				}

				//then if the filter flag is true, exclude this link
				if(filter) { continue; }
			}
			
			//if we're still going then the link is fine 
			//so add it to the spider locations array
			DustMeSelectors_spider.locations.push(uri);
		}
	}


	//***DEV
	//var jsonURIdata = encodeURIComponent(DustMeSelectors_tools.Object_toJSONString(DustMeSelectors_spider.locations));
	//window.open('data:application/json;charset=utf-8,' + jsonURIdata);
	//return;


	//empty the browser
	DustMeSelectors_spider.browser.loadURI('about:blank', null, null);
	
	//clear the current url loading icon
	DustMeSelectors_spider.setUIState('loadingurl', false);
	
	//remove any duplicate items from the locations array
	DustMeSelectors_spider.locations = DustMeSelectors_tools.arrayUnique(DustMeSelectors_spider.locations);

	//if we still have no locations then it can only be because 
	//there were links, but all of them were ignored because of rel-filters
	//(although it's also possible, if unlikely, that this was an HTML page 
	// on which there were <a> elements but all of them had an empty "href")
	if(DustMeSelectors_spider.locations.length == 0)
	{
		//clear the running property
		DustMeSelectors.running = false;

		//hide the spider statusbar
		DustMeSelectors_spider.setUIState('statusbar', true);

		//re-enable the URL group elements, and focus the "go" button
		DustMeSelectors_spider.setUIState('urlgroup', 0).focus();

		//report the "no good links" error
		//NOTE FOR REVIEWERS: the query value will never contain a remote URI
		window.openDialog('chrome://dustmeselectors/content/spidererror.xul?text='
			+ encodeURI(DustMeSelectors_tools.bundle.getString('error.nogoodlinks')),
			'errdialog', 'chrome,centerscreen,modal,resizable=no');
	}

	//otherwise we have some to check
	else
	{
		//so update the progress indicator to be determined and at the beginning
		DustMeSelectors_spider.setUIState('progress-update', 0);

		//create the empty spider log, including:
		//=> the sitemap url
		//=> the sourceurl (or null) for indicating a sitemap redirect
		//=> a counter to track how many pages we've tested
		//=> and how many files were actually listed 
		//   (ie, files is total, whereas pages doesn't including 
		//    unsupported files or pages that were skipped)
		//=> a summary property to say whether this spider operation is incomplete or complete
		DustMeSelectors_spider.log = {
			'baseurl'	: DustMeSelectors_spider.mapurl,
			'sourceurl'	: DustMeSelectors_spider.sourceurl,
			'files'		: 0,
			'pages'		: 0,
			'summary'	: 'incomplete'
			};
		for(i=0; i<DustMeSelectors_spider.locations.length; i++)
		{
			//nb. URI encode the location before using it as an object key
			DustMeSelectors_spider.log[encodeURIComponent(DustMeSelectors_spider.locations[i])] = {
				'status' : null,
				'message' : null,
				};
		}

		//extract a host reference for the selectors preference name from the map url
		DustMeSelectors_spider.prefname = DustMeSelectors_tools.getSelectorsDataPreferenceName(DustMeSelectors_spider.mapurl);

		//create a property to store the uri of sucesful requests for later reference
		//i was originally just reading back from the document uri
		//but that fails if the document gets redirected
		DustMeSelectors_spider.requesturi = null;
		
		//kick off by doing a find operation on the first URI in the locations array
		DustMeSelectors_spider.findRedundentSelectorsForPage(DustMeSelectors_spider.locations[0]);
	}
};




//find redundent selectors on a specified page
DustMeSelectors_spider.findRedundentSelectorsForPage = function(uri)
{
	//if the running flag  is still true
	if(DustMeSelectors.running)
	{
		//set the current url connecting icon
		DustMeSelectors_spider.setUIState('connectingurl', true);
	

		//***DEV LATENCY
		//setTimeout(function(){ 
		
		
		//create a new request object
		var request = new XMLHttpRequest();
		
		//store the request uri as a property of this request
		//so that we can retrieve it from inside the readystatechange handler
		//without worrying about synchronisation conflicts
		request.uri = uri;
	
		//when it completes
		request.onreadystatechange = function()
		{
			//if the running flag exists and is still true
			//nb. checking it exists in case the dialog closed in the meantime
			if(typeof DustMeSelectors != 'undefined' && DustMeSelectors.running === true)
			{
			
				//when the ready state changes to 2 (headers received)
				if(request.readyState == 2)
				{
					//set the current url loading icon
					//but surround it with a test for the spider object
					//to avoid console errors if the dialog is closed mid-request
					if(typeof DustMeSelectors_spider != 'undefined')
					{
						DustMeSelectors_spider.setUIState('loadingurl', true);
					}
				}
				
				//when the ready state is complete
				if(request.readyState == 4)
				{
					//***DEV LATENCY
					//setTimeout(function(){ 
					
					
					//do this on a try catch to handle errors
					//in case we get NS_ERROR_NOT_AVAILABLE
					try
					{
						if(/^(200|304)$/.test(request.status))
						{
							//get the response mime-type, and split to to remove any character encoding
							var mimetype = request.getResponseHeader('Content-Type').split(';')[0];
		
							//check the document content type against the list of allowed page types, 
							//(lowercasing both values just in case), and if they don't match
							if(DustMeSelectors_preferences.getPreference
								('string', 'mimetypes.pages').toLowerCase().indexOf(mimetype.toLowerCase()) < 0)
							{
								//ignore this page and move on to the next one
								//passing the uri and error message for logic and logging
								DustMeSelectors_spider.ignore(
									request.uri,
									DustMeSelectors_tools.bundle.getString('spider.invalid').replace('%1', mimetype)
									);
							}
		
							//otherwise we're good
							else
							{
								//store the uri so that we can refer to it later
								//i was originally just reading back from the document uri
								//but that fails if the document gets redirected
								DustMeSelectors_spider.requesturi = request.uri;
		
								//update the currenturl field with the new page URL
								DustMeSelectors_spider.setUIState('currenturl', request.uri);
		
								//disable [or re-enable] javascript in the browser, 
								//according to the nospiderjs preference
								DustMeSelectors_spider.browser.docShell.allowJavascript = !DustMeSelectors_preferences.getPreference('boolean', 'nospiderjs');
								
								//bind a domready handler to the browser to do the find operation
								DustMeSelectors_spider.browser.addEventListener('DOMContentLoaded',
									DustMeSelectors_spider.doFindOperation, false);
		
								//then load the page into the browser 
								//using the bypass-cache flag (equivalent to force-reload)
								//** nb. I haven't been able to confirm that this works 
								//** cos I can't get it to used cached pages in the first place!
								//** but it definitely has happened before, and this definitely
								//** should prevent it, so let's just see how it goes eh!
								//nb. specify the sitemap URL as the referer, just so 
								//we don't have problems with pages that don't display 
								//the same content when there's no referer information
								//but we don't need to specify a charset, we can just let 
								//the browser infer that, and obviously we don't need post data
								DustMeSelectors_spider.browser.loadURIWithFlags(
									request.uri, 
									DustMeSelectors_spider.browser.webNavigation.LOAD_FLAGS_BYPASS_CACHE, 
									DustMeSelectors_tools.ioService.newURI(DustMeSelectors_spider.mapurl, null, null), 
									null, null);
							}
						}
		
						//for any other status code
						else
						{
							//ignore this page and move on to the next one
							//padding the error message for logic and logging
							var errormsg = request.status + ' ' + request.statusText;
							if(errormsg == '' || errormsg == '0 ') { errormsg = DustMeSelectors_tools.bundle.getString('error.nostatus'); }
		
							DustMeSelectors_spider.ignore(
								request.uri,
								DustMeSelectors_tools.bundle.getString('error.xhr').replace('%1', errormsg)
								);
						}
					}
					catch(ex)
					{
						//ignore this page and move on to the next one
						//adding the general connection-failure error for logic and logging
						//but surround it with a test for the spider object
						//to avoid console errors if the dialog is closed mid-request
						if(typeof DustMeSelectors_spider != 'undefined')
						{
							DustMeSelectors_spider.ignore(
								request.uri,
								DustMeSelectors_tools.bundle.getString('error.noload')
								);
						}
					}

	
					//***DEV LATENCY
					//}, Math.random() * 2000); 
				}
				
			}
		};
	
		//try make an aysnchronous request and handle an error if it fails
		//other things being equal we should make a HEAD request, 
		//so that we don't slow down the spider by wastefully transferring 
		//more data than we need, however some sites return 405 Method Not Allowed 
		//when you do that, so just in case users have that problem, they can 
		//uncheck the verifyhead preference, which tells us to use a GET request instead
		//nb. we need to try catch this in case of malformed URLs or connection failure
		try
		{
			request.open(
				(!DustMeSelectors_preferences.getPreference('boolean', 'verifyhead') ? 'GET' : 'HEAD'), 
				request.uri, 
				true
				);
			request.send(null);
		}
		catch(err)
		{
			//ignore this page and move on to the next one
			//padding the error message for logic and logging
			//but surround it with a test for the spider object
			//to avoid console errors if the dialog is closed mid-request
			if(typeof DustMeSelectors_spider != 'undefined')
			{
				DustMeSelectors_spider.ignore(
					request.uri,
					DustMeSelectors_tools.bundle.getString('error.noconnect')
					);
			}
		}

	
		//***DEV LATENCY
		//}, Math.random() * 2000); 
	}
};


//do the find operation in response to domready event
DustMeSelectors_spider.doFindOperation = function(e)
{
	//ignore this event if the target document doesn't match the browser document
	//so we're not affected by domready events that bubble up from iframes
	if(DustMeSelectors_spider.browser.contentDocument !== e.originalTarget) { return; }
	
	//remove the browser domready handler immediately
	//to avoid the possibility of it firing more than once
	//which could ultimately give rise to log reference errors
	//** though that probably won't happen anymore now we have the target filter
	DustMeSelectors_spider.browser.removeEventListener('DOMContentLoaded',
		DustMeSelectors_spider.doFindOperation, false);
		
	//clear the current url loading icon
	DustMeSelectors_spider.setUIState('loadingurl', false);

	//show the group of find status icons in the statusbar
	DustMeSelectors_spider.setUIState('statusicons', false);

	//if the currenturi doesn't match the content document location
	//this will be because the page was re-directed
	if(DustMeSelectors_spider.requesturi != DustMeSelectors_spider.browser.contentDocument.location.href)
	{
		//so we need to identify the original URI in the locations array
		//and replace it with the new one both there and in the log object,
		//remembering to URI encode as we go, and noting the original URI as a log redirect message
		for(var i=0; i<DustMeSelectors_spider.locations.length; i++)
		{
			if(DustMeSelectors_spider.locations[i] == DustMeSelectors_spider.requesturi)
			{
				DustMeSelectors_spider.locations[i] = DustMeSelectors_spider.browser.contentDocument.location.href;
				
				DustMeSelectors_spider.log[encodeURIComponent(DustMeSelectors_spider.browser.contentDocument.location.href)] = {
					'status' : null,
					'message' : DustMeSelectors_tools.bundle
						.getString('spider.redirected').replace('%1', DustMeSelectors_spider.requesturi)
					};
				delete DustMeSelectors_spider.log[encodeURIComponent(DustMeSelectors_spider.requesturi)];
				
				//then update requesturi with the new location
				DustMeSelectors_spider.requesturi = DustMeSelectors_spider.browser.contentDocument.location.href;

				break;
			}
		}
	}

	//update the currenturl field with the current page URL
	DustMeSelectors_spider.setUIState('currenturl', DustMeSelectors_spider.browser.contentDocument.location.href);

	//perform the find operation, but pause for 100ms before starting it
	//so that complex scripted content will get the chance to be added first
	//(if it's run directly or in response to DOMContentLoaded, though possibly not from window onload)
	window.setTimeout(function()
	{
		DustMeSelectors.getAllSelectors(DustMeSelectors_spider.prefname,
			DustMeSelectors_spider.browser.contentDocument);
	
	}, 100);
};



//mid-spider save and continue operation
DustMeSelectors_spider.saveAndContinue = function(selectors, used)
{
	//update the progress indicator to show the current progress
	this.setUIState('progress-update', Math.ceil(100 * (this.log.files / this.locations.length)));

	//get a string snapshot of the current hostsindex
	var snapshot = DustMeSelectors_tools.Object_toJSONString(DustMeSelectors_tools.getHostsIndex());

	//iterate through both the selector groups and re-sort each object into rule-key order
	for(var i in selectors)
	{
		if(selectors.hasOwnProperty(i))
		{
			selectors[i] = DustMeSelectors.resort(selectors[i]);
		}
	}
	for(var i in used)
	{
		if(used.hasOwnProperty(i))
		{
			used[i] = DustMeSelectors.resort(used[i]);
		}
	}
	
	//convert selectors and used objects to JSON and save to file
	//and add this host to the hostsindex, if it doesn't exist already
	//along with the sitemap URL, that we'll need for resume functionality
	DustMeSelectors_filesystem.dumpToFile(this.prefname + '.json', DustMeSelectors_tools.Object_toJSONString(selectors));
	DustMeSelectors_filesystem.dumpToFile(this.prefname.replace('selectors', 'used') + '.json', DustMeSelectors_tools.Object_toJSONString(used));
	DustMeSelectors_tools.updateHostsIndex({ 'host' : this.prefname, 'sitemap' : this.log.baseurl }, true);

	//update the hosts index array in the opener instance
	//which we'll need when we open its view dialog
	//but we do it here instead of at final output
	//so that if a spider operation is abandonded midway
	//it's still up to date with the data saved so far
	opener.DustMeSelectors_tools.hostsindex = opener.DustMeSelectors_tools.getHostsIndex();
	
	//update the logsaved flag
	this.logsaved = true;
	
	//re-build the sitemaps array that's used for toggling the start/resume button
	this.buildSitemaps();
	
	//then if the viewdialog is open, re-populate its hostsindex menu (without preselection)
	//so it doesn't show new data (like pressing the spider's "view..." button would)
	//but it does make that data available now, or if you pause the spider 
	//then go to the view dialog without pressing the spider's "view..." button
	//where you'll nonetheless expect that data to be available 
	//BUT only do that if the hostsindex has changed, otherwise we'll be 
	//continually updating it, which will make it very hard to use at the same time
	//(as you try to select items, the selection highlight will continually flicker
	// and it will be difficult or impossible to click and select a menu item)
	//** unfortunately this resets the menulist's selectedIndex / selectedItem
	//** even though it visibly has the same selection, the lack of selectedFoo
	//** means that the menulist will lose its list-style-image favicon
	if(snapshot !== DustMeSelectors_tools.Object_toJSONString(DustMeSelectors_tools.getHostsIndex()))
	{
		var browser = opener.DustMeSelectors_browser;
		if(browser.viewdialog && !browser.viewdialog.closed)
		{
			browser.populateHostsIndexMenu(browser.viewdialog.document, false);
		}
	}
	

	//add the checked status flag to this item in the log
	//unless the value is null, which can happen if ..
	//** erm .. something to do with pausing and continuing 
	//** and the reference not having been created yet
	if(this.requesturi !== null)
	{
		try
		{
			//nb. remember that we have to URI encode the location before referring to it as an object key
			this.log[encodeURIComponent(this.requesturi)]['status'] = 'checked';
		}
		//this is for legacy safety to report any instances of this reference error, 
		//but it should never happen again, since all known causes have been fixed
		catch(err)
		{
			document.getElementById('dms-spider-mapurl').value = 
				'ERROR => Unable to log URL "' 
				+ this.requesturi
				+ '" (' + err.message + ')';
		}
	}		

	//then nullify the requesturi property
	this.requesturi = null;
	
	
	//increase the files and pages count in the spider log
	this.log.files++;
	this.log.pages++;

	//save the log
	this.saveLog();

	//enable the view button if necessary
	this.setUIState('view', false);

	//now iterate through the locations array, and compare with log status data
	//to look for a file we haven't checked yet
	for(var i=0; i<this.locations.length; i++)
	{
		//if we find one then continue to do the next find operation, and we're done here
		//nb. remember that we have to URI encode the location before referring to it as an object key
		if(this.log[encodeURIComponent(this.locations[i])].status === null)
		{
			this.findRedundentSelectorsForPage(this.locations[i]);
			return;
		}
	}
	
	
	//if we're still going then we didn't find any more files
	//so max-out the progressmeter for the sake of completion :-)
	this.setUIState('progress-update', 100);
	
	//then proceed to final output
	this.finalOutput();
};



//save the spider log
DustMeSelectors_spider.saveLog = function()
{
	//convert files and pages values to strings
	//so that all the json data is the same datatype
	//which is simpler ... but that's post rationale
	//the real reason is that i didn't bother to
	//include a number->json method :D
	this.log.files = this.log.files.toString();
	this.log.pages = this.log.pages.toString();

	//convert log object to JSON and save to file
	DustMeSelectors_filesystem.dumpToFile(this.prefname.replace('selectors', 'log')
		+ '.json', DustMeSelectors_tools.Object_toJSONString(this.log));

	//convert files and pages values back to numbers
	this.log.files = parseInt(this.log.files, 10);
	this.log.pages = parseInt(this.log.pages, 10);
};



//final output from a spidering operation
DustMeSelectors_spider.finalOutput = function()
{
	//send a stop command to reset the UI
	//and reset the running property to false
	this.stop();

	//add the summary complete flag to the log,
	this.log.summary = 'complete';

	//convert files and pages values to strings
	this.log.files = this.log.files.toString();
	this.log.pages = this.log.pages.toString();

	//convert log object to JSON and resave
	DustMeSelectors_filesystem.dumpToFile(this.prefname.replace('selectors', 'log')
		+ '.json', DustMeSelectors_tools.Object_toJSONString(this.log));


	//update the hostsindex file with a "spidered" flag for this host
	//which we'll refer to in the isSitemapURI logic 
	//to tell the difference between a sitemap that's been partially or fully spidered
	//so we know whether to show the "continue" or "spider again" button
	DustMeSelectors_tools.updateHostsIndex({ 'host' : this.prefname, 'spidered' : 'yes' }, true);

	//then we have to update the hosts index array in the opener instance
	opener.DustMeSelectors_tools.hostsindex = opener.DustMeSelectors_tools.getHostsIndex();
	
	//and then re-build the sitemaps array that's used for toggling the start/resume button
	this.buildSitemaps();
	
	//if the mapurl value still matches the sitemap URL we've just checked
	//then show the "repeatspider" button (else the "go" button will be left shown)
	if(document.getElementById('dms-spider-mapurl').value == this.log.baseurl)
	{
		this.setUIState('urlgroup', 3);
	}	

	//if the openafterspider preference is true 
	if(DustMeSelectors_preferences.getPreference('boolean', 'openafterspider'))
	{
		//if we have any active cleaningdata, delete it and reset the cleaning interface
		if(opener.DustMeSelectors_browser.cleaningdata)
		{
			delete opener.DustMeSelectors_browser.cleaningdata;
			opener.DustMeSelectors_browser.resetStylesheetCleaner();
		}
		
		//view saved selectors but don't focus the window
		this.viewSavedSelectors(false);
	}
	
	//either way set focus on the view button
	//which will open it if it's closed, or focus it if it's open
	document.getElementById('dms-spider-view').focus(); 

	//***DEV
	//this.benchmarkEnd = new Date().getTime();

	//if the notifyafterspider or notifyboxafterspider flag is true
	//we need to notify that the spider has finished
	if(DustMeSelectors_preferences.getPreference('boolean', 'notifyafterspider')
		||
		DustMeSelectors_preferences.getPreference('boolean', 'notifyboxafterspider'))
	{
		//get the selectors object for the selected host
		//then pass it to the view-summary-totals method, to get an object of totals
		var totals = DustMeSelectors_tools.getViewSummaryTotals(DustMeSelectors_tools.getDataObject(this.prefname, 'selectors', {}));
		
		//add the number of pages, converted to a number 
		totals.pages = parseInt(this.log.pages, 10);
		
		//then compile the totals data into a summary notification
		//according to whether we found any stylesheets or not
		if(totals.sheets == 0)
		{
			var notification = DustMeSelectors_tools.bundle.getString('view.none');
		}
		else
		{
			notification = DustMeSelectors_tools.bundle.getString('spider.summary')
				.replace('%1', (totals.rules == 0 ? DustMeSelectors_tools.bundle.getString('view.no') : totals.rules))
				.replace('%P1', (totals.rules == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
				.replace('%2', totals.sheets)
				.replace('%P2', (totals.sheets == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
				.replace('%3', totals.pages)
				.replace('%P3', (totals.pages == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')));
		}

		//if notifyafterspider is enabled, show the popup notification
		if(DustMeSelectors_preferences.getPreference('boolean', 'notifyafterspider'))
		{
			DustMeSelectors_tools.notify(notification);
		}

		//if notifyboxafterspider is enabled, show the notification box
		if(DustMeSelectors_preferences.getPreference('boolean', 'notifyboxafterspider'))
		{
			DustMeSelectors_tools.boxnotify(notification);
		}
	}
};


//menu command function: view saved selectors
DustMeSelectors_spider.viewSavedSelectors = function(direct)
{
	//copy the preference name back to the parent instance
	opener.DustMeSelectors_browser.prefname = this.prefname;

	//open the view dialog from the parent instance, forcing the selectors tab
	opener.DustMeSelectors_browser.viewSavedSelectors(this.prefname, true, direct);
}


//menu command function: open the preferences dialog
DustMeSelectors_spider.openPreferencesDialog = function(direct)
{
	//we have to be careful about the order of events here 
	//because if we call the opener preferences dialog method 
	//before calling window.close, this window won't close 
	//until after the preferences dialog has been closed 
	//it works if we do it the other way round, but I feel
	//entirely confident in that, so just to be on the safe side
	//bind a temporary unload listener that triggers the opener 
	//preferences dialog, then call window.close, which will 
	//close the window just before triggering the event
	window.addEventListener('unload', function()
	{
		opener.DustMeSelectors_browser.openPreferencesDialog();
	
	}, false);
	
	window.close();
}





//menu command function: pause spider operation 
DustMeSelectors_spider.pause = function()
{
	//call stop
	this.stop();

	//if the logsaved flag is true then we've saved the logdata for this sitemap
	//ie. at least one page has been spidered, and therefore we can show the "continue" button
	//but if the flag is false then we didn't get that far, so show the "start" button 
	//and then focus whichever of those buttons is now visible
	this.setUIState('urlgroup', (this.logsaved ? 2 : 0)).focus();
};


//menu command function: stop spider operation
//nb. this is also called when the spider dialog is about to close
//using "onbeforeunload" which captures only captures closing events 
//triggered by the accept button or the Ctrl/Cmd+W keystroke, 
//or using "onclose" which only captures the window "x" button
DustMeSelectors_spider.stop = function()
{
	//set the dustme running property to false
	//so that the stop command cascades into the dustme script
	DustMeSelectors.running = false;

	//remove the domready listener and empty the browser
	this.browser.removeEventListener('DOMContentLoaded', DustMeSelectors_spider.doFindOperation, false);
	this.browser.loadURI('about:blank', null, null);

	//re-enable the URL group elements
	this.setUIState('urlgroup', 0);

	//then pause for twice the apuspeed, which is 
	//long enough to give the running scan time to stop
	setTimeout(function()
	{
		DustMeSelectors_spider.updateStatusLabel(null, null);
		DustMeSelectors_spider.setUIState('statusbar', true);
		DustMeSelectors_spider.setUIState('loadingurl', false);

	//we get the APU speed from preferences, limiting and resaving if necessary, 
	//and then assigning to the tools properties which the APU actually uses
	}, (DustMeSelectors_tools.apuspeedCreate() * 2));
};


//ignore a page during spidering because of an error or unsupported mime-type
DustMeSelectors_spider.ignore = function(uri, reason)
{
	//update the currenturl field
	this.setUIState('currenturl', uri);

	//to ignore this page and move on to the next one
	//call skip with the error message as reason
	//the presence of the message tells skip what to do
	//and is also logged in the spidering log
	this.skip(reason, uri);
};


//skip a page during a spider operation (in response to ignore)
DustMeSelectors_spider.skip = function(reason, uri)
{
	//temporarily disable the pause button, to avoid any possible conflict
	//such as pressing pause at just the "wrong" time and causing a reference error
	document.getElementById('dms-spider-pausebutton').setAttribute('disabled', 'true');


	//save the notchecked flag to the log status indicated by the input URI
	//and save the reason text (ie. error message) to the corresponding log message
	this.log[encodeURIComponent(uri)]['status'] = 'notchecked';
	this.log[encodeURIComponent(uri)]['message'] = reason;
	

	//increase the files count but not the page count
	this.log.files++;

	//[re-]save the log
	this.saveLog();

	//remove the domready listener and empty the browser
	this.browser.removeEventListener('DOMContentLoaded', DustMeSelectors_spider.doFindOperation, false);
	this.browser.loadURI('about:blank', null, null);

	//update the progress indicator to show the current progress
	this.setUIState('progress-update', Math.ceil(100 * (this.log.files / this.locations.length)));

	//re-enable the pause button
	document.getElementById('dms-spider-pausebutton').setAttribute('disabled', 'false');

	//wait to give the stop time to happen, then move on to the next page
	window.setTimeout(function()
	{
		//if the running flag is still true
		if(DustMeSelectors.running)
		{
			
			//now iterate through the locations array, and compare with log status data
			//to look for a file we haven't checked yet
			for(var i=0; i<DustMeSelectors_spider.locations.length; i++)
			{
				//if we find one then continue to do the next find operation, and we're done here
				//nb. remember that we have to URI encode the location before referring to it as an object key
				if(DustMeSelectors_spider.log[encodeURIComponent(DustMeSelectors_spider.locations[i])].status === null)
				{
					DustMeSelectors_spider.findRedundentSelectorsForPage(DustMeSelectors_spider.locations[i]);
					return;
				}
			}
	
			//if we're still going then we didn't find any more files
			//so proceed to final output
			DustMeSelectors_spider.finalOutput();

		}
	}, 300);
};



//menu command function: resume a paused spider operation
DustMeSelectors_spider.resumeSpider = function()
{
	//the value in the urlbox represents the sitemap URL to continue spidering
	//either typed by the user to match an existing sitemap
	//or set by programatic action after clicking the view dialog's "continue" button
	//so first of all we need to run through the hostsindex, 
	//and find the host relating to this sitemap URI
	var 
	mapinput = document.getElementById('dms-spider-mapurl'),
	sitemap = mapinput.value,
	hostsindex = opener.DustMeSelectors_tools.hostsindex;
	for(var i in hostsindex)
	{
		if(!hostsindex.hasOwnProperty(i)) { continue; }
		
		if(typeof hostsindex[i].sitemap != 'undefined')
		{	
			if(hostsindex[i].sitemap == sitemap)
			{
				var sitemaphost = hostsindex[i].host;
			}
		}
	}
	
	//if we don't have a host
	//it will only be because the hostsindex includes legacy data 
	//from before we recorded the sitemap URL as part of the host data 
	if(typeof sitemaphost == 'undefined')
	{
		//so we'll just have to extract it from the sitemap URL
		//and re-compile it into a host value
		//** this means that legacy globally-saved data will be 
		//** re-assigned to the host specified in the sitemap
		//** even if global saving is currently enabled
		var sitemaphost = 'selectors.' + DustMeSelectors_tools.parseURL(sitemap).hostname.replace('www.', '');
	}

	//if we still don't have a host, we'll just have to
	//hide the continue button, restore and focus the start button, and we're done
	//this should never happen, it's a JiC safety condition
	if(typeof sitemaphost == 'undefined')
	{
		this.setUIState('urlgroup', 0).focus();
		return;
	}

	
	//now get the log object for the selected host, saved to the global log object
	this.log = DustMeSelectors_tools.getDataObject(sitemaphost, 'log', null);
	
	//and again, just in case that fails to retrieve a log, abandon this action
	if(this.log == null)
	{
		this.setUIState('urlgroup', 0).focus();
		return;
	}
	
	
	//set the running flag
	DustMeSelectors.running = true;

	//save the sitemap URL to the mapurl property
	//which is not actually necessary in this case, but gives us the freedom 
	//to expand the use of this property in future, and know that it's always accurate
	this.mapurl = sitemap;

	//try to get the favicon for the sitemap URL 
	//nb. this is the same as we do when parsing the sitemap the first time, 
	//but we do it again here to re-apply the textbox favicon image 
	//and include the load argument just in case it didn't have time to load last time
	DustMeSelectors_tools.getFavicon(this.mapurl, true, function(favicon)
	{
		if(favicon)
		{
			mapinput.style.listStyleImage = 'url(' + favicon + ')';
		}
	});

	//initialize the progress indicator
	this.setUIState('progress-init');

	//show the group of find status icons in the statusbar
	this.setUIState('statusicons', false);

	//show the spider statusbar
	this.setUIState('statusbar', false);

	//disable the URL group elements, and focus the "pause" button
	this.setUIState('urlgroup', 1).focus();
	
	//update the logsaved flag
	this.logsaved = true;


	//re-populate the locations array with every URL in the log
	//remembering to decode the URI values, since the locations array data is unencoded
	this.locations = [];
	for(var i in this.log)
	{
		if(!this.log.hasOwnProperty(i) || /^(baseurl|sourceurl|files|pages|summary)$/i.test(i)) { continue; }
		
		this.locations.push(decodeURIComponent(i));
	}

	//reset the requesturi property
	this.requesturi = null;

	//set the prefname to the sitemap host 
	this.prefname = sitemaphost;
	
	
	//convert files and pages values to numbers
	this.log.files = parseInt(this.log.files, 10);
	this.log.pages = parseInt(this.log.pages, 10);
	
	//update the progress indicator to show the saved progress
	this.setUIState('progress-update', Math.ceil(100 * (this.log.files / this.locations.length)));


	//now iterate through the locations array, and compare each one 
	//with the log status data, to look for a file we haven't checked yet
	for(var i=0; i<this.locations.length; i++)
	{
		//when we find one then continue to do the next find operation, and we're done here
		//nb. remember that we have to URI encode the location before referring to it as an object key
		if(this.log[encodeURIComponent(this.locations[i])].status === null)
		{
			this.findRedundentSelectorsForPage(this.locations[i]);
			return;
		}
	}


	//***DEV
	//var jsonURIdata = encodeURIComponent(DustMeSelectors_tools.Object_toJSONString(this.log));
	//window.open('data:application/json;charset=utf-8,' + jsonURIdata);


	//if we get here then proceed to final output
	//but this is just here for safety -- it shouldn't happen anymore
	this.finalOutput();
};



//menu command function: spider a sitemap again
//this is essentially just an alias to spiderSitemap
//but triggered by the "spider again" button that shows up 
//instead of "continue" for a site that has been fully spidered
DustMeSelectors_spider.spiderAgain = function()
{
	//we give the user an option here to either 
	//keep the selectors data they already have and just re-check all the pages 
	//or trash all that data and spider the sitemap again from scratch
	window.openDialog('chrome://dustmeselectors/content/respideragain.xul', 'respider', 'chrome,centerscreen,modal,resizable=no');
};


//if the user opts to keep the data
DustMeSelectors_spider.justSpiderAgain = function(dialog)
{
	//we have to close the dialog manually since we're not using the "accept" button
	//(because we wouldn't be able to control it's position if we did)
	dialog.close();
	
	//then spider the sitemap, passing a noconfirm flag
	//so that it doesn't show the resite or respider dialog again
	this.spiderSitemap(null, true);
};


//or if the user opts to trash the data
DustMeSelectors_spider.trashSpiderAgain = function(dialog, respider)
{
	//we have to close the dialog manually since we're not using the "accept" button
	//(because we wouldn't be able to control it's position if we did)
	dialog.close();
	
	//get references to the input sitemap URL, and to the hostsindex object
	var sitemap = document.getElementById('dms-spider-mapurl').value;
	var hostsindex = opener.DustMeSelectors_tools.hostsindex;
	
	//if the respider argument is strictly true then this came from the respider dialog
	//so we have to delete the data corresponding with a specific sitemap
	if(respider === true)
	{
		//the value in the urlbox represents the sitemap URL to re-spider
		//so run through the hostsindex, and get the host relating to that sitemap
		//nb. we can't just use the sitemap preference name like we do from resite 
		//because the ignore preferences might have changed, so the prefname 
		//for this host might not be the one that this sitemap was stored again
		//which does of course mean that we'll end up deleting data for one host
		//and then storing the new data against a different (top-level host)
		//but if we didn't do it this way then the original data wouldn't be deleted
		//we don't have that issue with the resite option, because that dialog 
		//won't appear at all unless we have host data by the same ignore options
		for(var i in hostsindex)
		{
			if(hostsindex.hasOwnProperty(i))
			{
				if(hostsindex[i].sitemap == sitemap)
				{
					var sitemaphost = hostsindex[i].host;
					break;
				}
			}
		}
	}
	
	//otherwise it came from the resite dialog, so we simply have to 
	//delete the data corresponding with the sitemap URL's preference name
	//which we already know will exist else we wouldn't be here doing this
	else
	{
		var sitemaphost = DustMeSelectors_tools.getSelectorsDataPreferenceName(sitemap);
	}
	
	//now clear the site's data, passing the false argument to the clear function
	//to say that it didn't come from the view dialog
	//(and therefore not to look for the hostname in the view dialog's menu selection)
	//then passing the sitemap host directly, so it knows what to delete
	//but wrap it in exception handling just in case it fails,
	//** which is possible though I'm not entirely sure of the circumstances
	//** but it's something to do with pressing pause before any selectors 
	//** data has been stored and/or before the log has been saved 
	//** so if it does fail we just carry on as though you'd pressed "keep"
	//** => this probably can't happen anymore now we've fixed the stop function
	//**    but keep this exception handling any, at least for the time being
	try { opener.DustMeSelectors_browser.doClearSavedSelectors(false, null, sitemaphost); } 
	catch(ex){}
	
	//then spider the sitemap, passing a noconfirm flag
	//so that it doesn't show the resite or respider dialog again
	this.spiderSitemap(null, true);
};




//update the status label
DustMeSelectors_spider.updateStatusLabel = function(rules, sheets)
{
	//save a reference to the status label
	var statuslabel = document.getElementById('dms-spider-statuslabel');

	//if the rules and sheets arguments are strictly null,
	//remove the label's value and tooltip attributes 
	if(rules === null && sheets === null)
	{
		statuslabel.removeAttribute('value');
		statuslabel.removeAttribute('tooltip');
	}

	//otherwise if the values are not both strictly true 
	//apply the value and tooltip attribute, and update the tooltip
	else if(!(rules === true && sheets === true))
	{
		statuslabel.setAttribute('value', DustMeSelectors_tools.format(rules) + '/' + sheets + '/' + (this.log.pages + 1));
		statuslabel.setAttribute('tooltip', 'dms-spider-statuslabel-tooltip');
		document.getElementById('dms-spider-statuslabel-tooltip-selectors').setAttribute('value', 
			DustMeSelectors_tools.bundle.getString('spider.details.selectors')
			.replace('%1', DustMeSelectors_tools.format(rules))
			.replace('%P1', (rules == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
			);		
		document.getElementById('dms-spider-statuslabel-tooltip-stylesheets').setAttribute('value', 
			DustMeSelectors_tools.bundle.getString('spider.details.stylesheets')
			.replace('%2', sheets)
			.replace('%P2', (sheets == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
			);		
		document.getElementById('dms-spider-statuslabel-tooltip-pages').setAttribute('value', 
			DustMeSelectors_tools.bundle.getString('spider.details.pages')
			.replace('%3', this.log.pages + 1)
			.replace('%P3', (this.log.pages == 0 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
			);		
	}

	//if the values are boolean true, it means leave the value and tooltip as it is
};



//size the dialog window to match its contents
//we have to jump through a bit of a hoop to do this
//because the native window.sizeToContent doesn't work anymore
//** and hasn't worked since FF2, though the docs have nothing to say about it!
//** so we have to implement a manual solution, that's rather a crude hack :-O
//** nb. testing again in FF19 it does seem to work now, but not correctly 
//** (the size it shrinks to is still larger than the visible content
//**  and larger than it defaults to when opened with no set dimensions)
DustMeSelectors_spider.shrinkToContent = function(shrink)
{
	//it's not possible to read the rendered size of XUL elements, so instead 
	//we have an <html:div> element with 100% height, inserted at just the right
	//place in the markup to make it flex as we show and hide the statusbar vbox
	//and ultimately means that its offsetHeight always reflects the content height :-)

	//so ... save a reference to the measure element
	var measure = document.getElementById('dms-spider-dialogmeasure');
	
	//then if the shrink argument is undefined  
	//this is being called from the dialog's load listener, 
	//so get the measure element's height and save it as the default dialog height
	//nb. since the dialog was deliberately opened with zero height, and the 
	//dialog measure expands with the height of the content, not the window,
	//we know that the dialogHeight will return the greater (applicable) height
	if(typeof shrink == 'undefined')
	{
		DustMeSelectors_spider.dialogHeight = measure.offsetHeight;

		//then set the height immediately so there's no visible flicker
		//as it grows to its initial height after being opened at zero
		window.innerHeight = DustMeSelectors_spider.dialogHeight;
	}
	
	//then if the shrink argument is true
	//set the window height to match the saved dialog height
	//which will shrink it back to default when hiding the statusbar
	//nb. pause momentarily before reading and applying the size 
	//to give the window rendering a chance to catch up to the changes
	if(shrink === true)
	{
		setTimeout(function()
		{
			window.innerHeight = DustMeSelectors_spider.dialogHeight;

			//** sometimes if you start,pause,start,pause several times quickly 
			//** the measure element doesn't shrink down again when you pause, 
			//** so catch that situation and use the sizeToContent method 
			//** which doesn't reduce it enough, but it's better than nothing!
			if(window.innerHeight != DustMeSelectors_spider.dialogHeight)
			{
				window.sizeToContent();
			}

		},10);
	}
	
	//otherwise [if the shrink argument is false]
	//set the window height to match the current height
	//which will expand it when showing the statusbar
	//nb. pause momentarily before reading and applying the size 
	//to give the window rendering a chance to catch up to the changes
	else  
	{
		setTimeout(function()
		{
			window.innerHeight = measure.offsetHeight;
		
		},10);
	}
};



//set the UI state
DustMeSelectors_spider.setUIState = function(type, arg)
{
	switch(type)
	{
		//nb. this option has a multi-state flag controlling four buttons:
		//0 => show the "start" button and hide the others
		//1 => show the "pause" button and hide the others
		//2 => show the "resume" button and hide the others
		//3 => show the "repeat" button and hide the others
		//and it returns a reference to the now-visible button
		//which we can use to set the user focus on that button
		//(since hiding a button that has the focus, loses the focus)
		//it also disables the sitemap URL textbox while a spider is in progress
		//because changing the value mid-spider causes problems for "resume"
		case 'urlgroup' :

			var hidden = { go : 0, pause : 1, resume : 2, repeat : 3 };
			for(var i in hidden)
			{
				if(!hidden.hasOwnProperty(i)) { continue; }
				
				var 
				button = document.getElementById('dms-spider-' + i + 'button'),
				hide = (hidden[i] != arg);
				
				button.setAttribute('hidden', hide);
				button.setAttribute('disabled', hide);
				
				if(!hide)
				{
					var userbutton = button;
				}
			}
			
			//if we're showing the pause button, set the mapinput to readonly
			//(which is visually better than disabled for this case, i reckon)
			//and remove its "enablehistory" attribute 
			//to hide the arrow that triggers its autocomplete popup
			//for any other state, remove readonly and restore the attribute
			//** why does this become disabled for attr[disabled]="false"?
			var mapinput = document.getElementById('dms-spider-mapurl');
			mapinput[arg == 1 ? 'setAttribute' : 'removeAttribute']('readonly', 'true');
			mapinput[arg == 1 ? 'removeAttribute' : 'setAttribute']('enablehistory', 'true');
			
			return userbutton;
			//break;

		case 'statusbar' :
		
			//if the argument boolean is false, to show the statusbar, 
			//wrap it in a short pause, so that circumstances such as 
			//failing to load a sitemap document which happen very quickly 
			//don't show the statusbar at all, so you don't see 
			//a flicker of the dialog growing then immediately shrinking again
			var pause = arg === false ? 100 : 0;
			
			if(typeof DustMeSelectors_spider.shrinkDelay != 'undefined'
				&& DustMeSelectors_spider.shrinkDelay !== null)
			{
				window.clearTimeout(DustMeSelectors_spider.shrinkDelay);
				DustMeSelectors_spider.shrinkDelay = null;
			}
			DustMeSelectors_spider.shrinkDelay = window.setTimeout(function()
			{
				DustMeSelectors_spider.shrinkDelay = null;

				//show or hide the statusbar and statusicons as applicable
				document.getElementById('dms-spider-statusbar').setAttribute('hidden', arg);
				if(arg === true)
				{
					DustMeSelectors_spider.setUIState('statusicons', true);
				}
				
				//size the window to match its content, passing the argument boolean
				//so that it shrinks to its default (onload) size when hiding the statusbar
				//and grows to match the current content height when showing it 
				DustMeSelectors_spider.shrinkToContent(arg);
			
			}, pause);
			
			break;

		case 'statusicons' :

			document.getElementById('dms-spider-statusicons').setAttribute('hidden', arg);
			document.getElementById('dms-spider-statusicon').setAttribute('src', 'chrome://dustmeselectors/content/statusicon_busy.gif');

			break;

		case 'progress-init' :

			document.getElementById('dms-spider-progress').setAttribute('mode', 'undetermined');
			document.getElementById('dms-spider-currenturl').setAttribute('value',
				DustMeSelectors_tools.bundle.getString('spider.processing'));
			document.getElementById('dms-spider-currenturl').removeAttribute('tooltip');

			break;

		case 'progress-update' :

			document.getElementById('dms-spider-progress').setAttribute('mode', 'determined');
			document.getElementById('dms-spider-progress').setAttribute('value', arg);

			break;

		case 'currenturl' :

			var status = DustMeSelectors_tools.bundle.getString('spider.status').replace('%1', arg);
			
			document.getElementById('dms-spider-currenturl').setAttribute('value',
				status.replace('%3', (this.log.files + 1)).replace('%4', this.locations.length));
			
			//nb. using a tooltip element rather than tooltiptext because it updates 
			//while visible rather than showing a snapshot from the time it appeared
			//but the tooltip is disassociated by default so it doesn't 
			//show up as a tiny little yellow square when it has no content 
			if(!document.getElementById('dms-spider-currenturl').getAttribute('tooltip'))
			{
				document.getElementById('dms-spider-currenturl').setAttribute('tooltip', 'dms-spider-currenturl-tooltip');
			}
			document.getElementById('dms-spider-currenturl-tooltip-url').setAttribute('value', arg);
			document.getElementById('dms-spider-currenturl-tooltip-status').setAttribute('value', 
				DustMeSelectors_tools.bundle.getString('spider.statustitle')
				.replace('%1', (this.log.files + 1)).replace('%2', this.locations.length));

			break;

		case 'connectingurl' :

			document.getElementById('dms-spider-statusicon').setAttribute('src', 
				(arg ? 'chrome://dustmeselectors/skin/connecting.png' : 'chrome://dustmeselectors/content/statusicon_busy.gif'));

			break;

		case 'loadingurl' :

			document.getElementById('dms-spider-statusicon').setAttribute('src', 
				(arg ? 'chrome://dustmeselectors/skin/loading.png' : 'chrome://dustmeselectors/content/statusicon_busy.gif'));

			break;

		case 'view' :

			document.getElementById('dms-spider-view').setAttribute('disabled', arg);

			break;
	}
};