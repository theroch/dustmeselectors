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


//dust-me selectors browser object
var DustMeSelectors_browser = new Object();

//define a flag for whether the extension has been initialised 
//which we use to prevent command actions firing before we're ready
DustMeSelectors_browser.beeninitialised = false;



//initial setup when the chrome loads
window.addEventListener('load', function()
{
	
	//***DEV (delete entire prefs branch for testing)
	//Components.classes["@mozilla.org/preferences-service;1"]
	//	.getService(Components.interfaces['nsIPrefService'])
	//	.deleteBranch('extensions.dustmeselectors.');
	//return;
	


	//the conventional order for listing modifiers varies by platform 
	//and on the mac, firefox automatically sorts them correctly in the main menu 
	//but in the toolbar button and add-on bar menu, it sticks with the attribute order
	//whereas windows applies them in the attribute order in all the menus 
	//so we define them in the mac order, and that way they'll be correct on the mac 
	//then for windows and linux, we reverse the order and re-apply the attributes
	if(DustMeSelectors_tools.platform != 'darwin')
	{
		['findkey','viewkey','spiderkey','spiderthiskey','preferenceskey'].forEach(function(keyid)
		{
			var key = document.getElementById('dms-' + keyid);
			var mods = key.getAttribute('modifiers').split(' ');
			mods.reverse();
			key.setAttribute('modifiers', mods.join(' '));
		});
	}	

	//if this firefox version has the "Web Developer" submenu
	//add it at the bottom, just before the devToolsEndSeparator
	//nb. otherwise its default position is in the "Tools" menu
	//just before the sanitizeSeparator, after "Page Info"
	var webdevpopup = document.getElementById('menuWebDeveloperPopup');
	var devendline = document.getElementById('devToolsEndSeparator');
	if(webdevpopup && devendline)
	{
		webdevpopup.insertBefore(document.getElementById('dms-mainmenu'), devendline);
	}
	
	//if the showinstatus preference is true
	//show the statusbar/add-on bar overlay
	if(DustMeSelectors_preferences.getPreference('boolean', 'showinstatus'))
	{
		DustMeSelectors_browser.setUIState('statusoverlay', false);
	}
	
	//if the showincontext preference is true
	//show the document context-menu item and its separator
	if(DustMeSelectors_preferences.getPreference('boolean', 'showincontext'))
	{
		DustMeSelectors_browser.setUIState('contextmenu', false);
	}
	
	//then bind a popupshowing event to the main contextmenu 
	//that disables it for local files, or enables it otherwise
	//** be better to add and remove this listener with setUIState('contextmenu')
	//** but this is probably only temporary anyway, until I've fixed local spidering
	document.getElementById('contentAreaContextMenu').addEventListener('popupshowing', function()
	{
		var disabled = (DustMeSelectors_tools.getSelectorsDataPreferenceName(window.content.document.location.href) == 'selectors.@local');
		document.getElementById('dms-contextmenu-separator').setAttribute('disabled', disabled);
		document.getElementById('dms-contextmenu-spider').setAttribute('disabled', disabled);
		document.getElementById('dms-contextmenu-spider').setAttribute('image', 
			'chrome://dustmeselectors/content/statusicon_' + (disabled ? 'disabled' : 'default') + '.png');

	}, false);
	
	
	//initialize the data saving options
	//nb. do this before getting the addon manager data, 
	//so that we can use its asynchronicity as a buffer against 
	//the creation of the data folder and files being less than instant
	//(which I've no specific reason to think it won't be, but you know!)
	DustMeSelectors_tools.initialiseDataSavingOptions();

	//add an observer to detect when firefox quits
	//so we can delete all stored data if deleteonquit is enabled
	//nb. we add the observer whether or not we need it 
	//so we can set the havequitobserver preference every time
	DustMeSelectors_browser.addQuitObserver();

	
	//now load the addon data from install.rdf using the AddonManager 
	//nb. this loads asynchronously so we have to wait for its callback
	//before we can use the value and proceed to finish initialization
	Components.utils.import("resource://gre/modules/AddonManager.jsm");
	AddonManager.getAddonByID('{3c6e1eed-a07e-4c80-9cf3-66ea0bf40b37}', function(addon) 
	{
		
		//save the addon data to a unique dust-me object
		DustMeSelectors_addon = addon;
		
		//now check the preferences for a version number, and if the value 
		//is empty (new install) or it's a different version (invariably upgrading)
		var version = DustMeSelectors_preferences.getPreference('string', 'version');
		if(version == '' || version != DustMeSelectors_addon.version)
		{
			//set the version preference from the addon data
			DustMeSelectors_preferences.setPreference('string', 'version', DustMeSelectors_addon.version)
		
			//then if the previous version was empty (new install)
			//or earlier than v4.0 (ie. upgrading from v3.01 or earlier)
			if(version == '' || parseFloat(version) < 4)
			{
				//insert our new button into the main navigation toolbar by default,
				//which will add it at the very end and then persist it there
				//unless it's already inserted, so that we don't end up moving it
				//in cases where the user has manually edited the version number
				//(pretty unlikely, but easy enough to allow for, so may as well)
				//nb. we must only do this on first install or upgrade 
				//so it doesn't get re-inserted if the user moves or removes it
				if(!document.getElementById('dms-toolbaritem'))
				{
					var toolbar = document.getElementById('nav-bar');
					toolbar.insertItem('dms-toolbaritem', null);
					toolbar.setAttribute('currentset', toolbar.currentSet);
					document.persist(toolbar.id, 'currentset');
				}
			}
		
			//delete all the legacy preferences we don't need anymore
			//nb. check prefHasUserValue first in case it wasn't defined in the first place
			var deadprefs = ['dialogs.preferences','dialogs.spider','disable','ignorequery'];
			for(var i = 0; i < deadprefs.length; i ++)
			{
				if(DustMeSelectors_preferences.prefservice.prefHasUserValue(deadprefs[i]))
				{
					DustMeSelectors_preferences.prefservice.deleteBranch(deadprefs[i]);
				}
			}
		}	
				
		
		//set the chunksize preference (from default or existing preference)
		//so it's always there for power-user control despite the lack of UI control for it
		DustMeSelectors_preferences.setPreference('number', 'chunksize', DustMeSelectors_preferences.getPreference('number', 'chunksize'));
		
		//if we have a legacy "includeelements" preference, 
		//set the new "ignoreelements" preference to its inverse 
		//to maintain the same end behavior as the user specified
		//then delete the legacy preference so we don't do this again
		if(DustMeSelectors_preferences.prefservice.prefHasUserValue('includeelements'))
		{
			DustMeSelectors_preferences.setPreference('boolean', 'ignoreelements', !DustMeSelectors_preferences.getPreference('boolean', 'includeelements'));
			DustMeSelectors_preferences.prefservice.deleteBranch('includeelements');
		}
		
	
		//create a label suffix for the find command key 
		//that we can add to the tooltiptext of the statusicon and toolbarbutton 
		//getting the key and modifiers data from the <key> element, then 
		//converting them to delimited symbols as applicable to the platform
		//nb. this will have the platform-specific symbol order we defined at the start
		var findkey = document.getElementById('dms-findkey'); 
		var symbols = findkey.getAttribute('modifiers').split(/[\s]+/);
		for(var i = 0; i < symbols.length; i ++)
		{
			switch(symbols[i])
			{
				case 'accel' : 
					symbols[i] = (DustMeSelectors_tools.platform == 'darwin' 
									? '\u2318' 
									: DustMeSelectors_tools.bundle.getString('menu.modifier.accel'));
					break;
				case 'alt' : 
					symbols[i] = (DustMeSelectors_tools.platform == 'darwin' 
									? '\u2325' 
									: DustMeSelectors_tools.bundle.getString('menu.modifier.alt'));
					break;
				case 'shift' : 
					symbols[i] = (DustMeSelectors_tools.platform == 'darwin' 
									? '\u21e7' 
									: DustMeSelectors_tools.bundle.getString('menu.modifier.shift'));
					break;
			}
		}
		symbols.push(findkey.getAttribute('key'));
		DustMeSelectors_browser.findkeylabel = 
			' \u00a0\u00a0 ' + symbols.join(DustMeSelectors_tools.platform == 'darwin' ? '' : '+');

		//then call setUIState with the enable flag, which will 
		//set the view and clear menu items, and add the findkeylabel
		DustMeSelectors_browser.setUIState('disable', false);
		
		
		//if the toolbar button is present, show or hide the toolbar menu 
		//"getting started" item and separator according to the showtoolbarstarted preference
		if(document.getElementById('dms-toolbarbutton'))
		{
			var showtoolbarstarted = DustMeSelectors_preferences.getPreference('boolean', 'showtoolbarstarted');
			document.getElementById('dms-toolbarpopup-started-separator').setAttribute('hidden', !showtoolbarstarted);
			document.getElementById('dms-toolbarpopup-started').setAttribute('hidden', !showtoolbarstarted);
		}
			

		//update any windows-specific language, which we can 
		//identify by the "winnt-lang" class on each affected element
		//then a "dms:winnt-foo" attribute that stores the windows language
		//ie. dms:winnt-label would replace the default label attribute
		//nb. doing it this way rather than applying stringbundle values 
		//means that the language can all be defined in the same DTD and XML
		//nnb. I did try changing the preferences commandkey the same way
		//but it broken the key entirely, so neither the old or new value worked
		if(DustMeSelectors_tools.platform == 'winnt')
		{
			var winntnodes = document.getElementsByClassName('winnt-lang');
			for(var len = winntnodes.length, i = 0; i < len; i ++)
			{
				var attrs = winntnodes[i].attributes;
				for(var alen = attrs.length, a = 0; a < alen; a ++)
				{
					if(attrs[a].name.indexOf('dms:winnt-') >= 0)
					{
						winntnodes[i].setAttribute(attrs[a].name.split('dms:winnt-')[1], attrs[a].value);
					}
				}
			}
		}
		
		//set the command key property according to platform
		//which is the control key for windows and linux or the command (apple) key for mac
		//nb. we use this as part of the selection handling in the view selectors dialog
		DustMeSelectors_browser.command = 'ctrlKey';
		if(DustMeSelectors_tools.platform == 'darwin')
		{
			DustMeSelectors_browser.command = 'metaKey';
		}
		
		//define an openview flag that means the view window can open
		DustMeSelectors_browser.openview = true;
	
	
		//check the preferences for allowed mime-types
		//then set default values for each that's not defined
		//nb. we have to do this now because the autorun listeners use them
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
		
		//get the autorun preference and set the autorun menu items
		var autorun = DustMeSelectors_preferences.getPreference('boolean', 'autorun');
		DustMeSelectors_browser.setUIState('autorun', !autorun);
	
		//get the autorunhosts array and save it to a global property
		//nb. this will return a default dataset if none has ever been defined
		DustMeSelectors_browser.autorunhosts = DustMeSelectors_tools.getAutorunHosts();
		
		//then if autorun is enabled
		if(autorun)
		{
			//then add the autorun listeners
			DustMeSelectors_browser.addAutorunListeners();
		}
		

		//and finally record that the the extension has been initialized 
		DustMeSelectors_browser.beeninitialised = true;
	
	});	

}, false);



//some window management when the chrome unloads
window.addEventListener('unload', function()
{
	//dialogs windows to check
	var dialogs = ['prefdialog', 'spiderdialog', 'viewdialog'];

	//iterate through the dialogs, and in each case
	//if the dialog is present and open, close it
	for(var i=0; i<dialogs.length; i++)
	{
		if(DustMeSelectors_browser[dialogs[i]] && !DustMeSelectors_browser[dialogs[i]].closed)
		{
			DustMeSelectors_browser[dialogs[i]].close();
		}
	}

}, false);



//update the control settings
DustMeSelectors_browser.updateControlSettings = function(loc)
{
	//***DEV
	//window.content.console.log('updateControlSettings(prefname="'+DustMeSelectors_tools.getSelectorsDataPreferenceName(loc)+'")');
	
	//save the specified (document) location object, 
	//then get and save the selectors data preference name for that location
	//then return the resulting prefname (so the caller can assign it locally)
	return (this.prefname = DustMeSelectors_tools.getSelectorsDataPreferenceName(this.location = loc));
};




//add the application quit observer, unless we already have one
//nb. this will receive a shutdown event once all observers
//have agreed to the shutdown and the application is about to quit
//however observers are application-wide, so to avoid adding 
//one per window we only add one if it doesn't already exist
//** surely there's a better way of doing this, but I can't 
//** work out how to identify this observer from an enumerator
DustMeSelectors_browser.addQuitObserver = function()
{
	if(!DustMeSelectors_preferences.getPreference('boolean', 'havequitobserver'))
	{
		DustMeSelectors_preferences.setPreference('boolean', 'havequitobserver', true);

		DustMeSelectors_tools.observerService.addObserver
			(DustMeSelectors_browser.doQuitObserver, 'quit-application', false);
	}
};


//respond to the application quit obserer by resetting the preference
//so that subsequent startup won't think we already have one
//then if deleteonquit is enabled we delete all stored data 
DustMeSelectors_browser.doQuitObserver = function()
{
	DustMeSelectors_preferences.setPreference('boolean', 'havequitobserver', false);

	if(DustMeSelectors_preferences.getPreference('boolean', 'deleteonquit'))
	{
		DustMeSelectors_filesystem.deleteStoredData();
	}
};




//add the autorun domcontent listeners 
DustMeSelectors_browser.addAutorunListeners = function()
{
	//***DEV
	//window.content.console.log('(+) addAutorunListeners');

	//bind a domcontent loaded event that will fire on 
	//each loaded browser document, and those events
	//in turn will add any mutation observers we need 
	document.getElementById('appcontent').addEventListener
		('DOMContentLoaded', this.doAutorunListener, false);   
		
	//however if we already have an active observer 
	//iterate through its mutations and re-connect them
	//nb. we have to re-instantiate the observer to do this
	//we can't just re-connect to the existing instance
	if(this.observer)
	{
		//***DEV
		//var keys = [];
		//for(var i in this.mutations){if(this.mutations[i]){ keys.push(i); }}
		//window.content.console.log('    (^) mutation observers "'+keys.join('" and "')+'" are re-activated');

		//nb. I got an error here in ubuntu that I then couldn't replicate
		//so I've added exception handling just in case of, erm, something
		//(because the error when it occurred prevented preferences being accepted)
		try
		{
			this.observer = new MutationObserver(this.mutationbuffer.dispatcher);
			for(var i in this.mutations)
			{
				if(this.mutations.hasOwnProperty(i) && this.mutations[i])
				{
					this.observer.observe(this.mutations[i].target, this.mutations[i].config);
				}
			}
		}
		catch(ex)
		{
			try { window.content.console.log('Unexpected Exception in Dust-Me Selectors ('+ex.message+')'); }
			catch(ix) {} 
		}
	}
};


//remove the autorun listeners
DustMeSelectors_browser.removeAutorunListeners = function()
{
	//***DEV
	//window.content.console.log('(-) removeAutorunListeners');

	//remove the domcontent loaded event
	document.getElementById('appcontent').removeEventListener
		('DOMContentLoaded', this.doAutorunListener, false);
		
	//if we have an active mutation observer, disconnect it
	if(this.observer)
	{
		//***DEV
		//window.content.console.log('    (<) mutation observers are disconnected');

		this.observer.disconnect();
	}
};


//respond to the autorun domcontent event 
DustMeSelectors_browser.doAutorunListener = function(e)
{
	//***DEV
	//window.content.console.log('( ) doAutorunListener');
	
	//just in case the suppressed flag is true, do nothing
	//nb. this block also happens in the scan function 
	//although neither are strictly necessary, since 
	//we now remove the autorun listeners at the same time
	//as setting the suppressed flag (belt and braces!)
	if(DustMeSelectors_browser.suppressed === true) { return; }

	//else save a shorcut reference to the content document 
	var doc = e.originalTarget;
	
	//then if it's not an HTML page, or it's inside an [i]frame, do nothing
	//nb. normal scan and spidering doesn't check iframe pages 
	//so we should be consistent for now, until that changes
	//nb. among other things, this will stop us from trying to scan image views, 
	//XML documents, and application pages like about:config and about:newtab
	if(!(doc instanceof HTMLDocument) || doc.defaultView.frameElement) 
	{ 
		//***DEV
		//window.content.console.log('(\u2718) document at "'+doc.documentURI.replace(/.*\//g, '/')+'" is inside an [i]frame');
	
		return; 
	}

	//however it doesn't stop text views like stylesheets and text-files
	//which have a parseable DOM and therefore appear like scannable documents
	//so check the document mime-type against the allowed list from preferences
	//(lowercasing both values just in case), and ignore pages that don't match
	//nb. but this still won't stop it from scanning RSS pages, which have 
	//the content-type of an XHTML page because firefox fully renders them 
	//(whereas most XML documents are displayed with a default source rendering)
	if(DustMeSelectors_preferences.getPreference
		('string', 'mimetypes.pages').toLowerCase().indexOf(doc.contentType.toLowerCase()) < 0)
	{
		//***DEV
		//window.content.console.log('(\u2718) document at "'+doc.documentURI.replace(/.*\//g, '/')+'" has invalid mime-type "'+doc.contentType+'"');
	
		return; 
	}
	
	//and that doesn't stop about:blank which also appears like a normal HTML page
	//but we can specifically exclude any pages which don't have a proper protocol
	//and that will catch all the other about pages too, eg. about:neterror
	//nb. originally did that by excluding pages with an empty host 
	//however that prevents scanning pages with a file:// address
	if(!doc.documentURI || !/([a-z]+:\/\/)/.test(doc.documentURI))
	{
		//***DEV
		//window.content.console.log('(\u2718) document has no URI or protocol');
	
		return; 
	}
	
	//and that doesn't stop frameset pages, which don't have a body
	//so we can exclude them (and anything else unexpected) by checking we have a body
	if(!doc.querySelector('body'))
	{
		//***DEV
		//window.content.console.log('(\u2718) document at "'+doc.documentURI.replace(/.*\//g, '/')+'" has no body');
	
		return; 
	}
	
	
	//if we're still here, then autorun is active
	//but may yet be de-activated by host restriction
	
	//get the effective host for the documentURI
	//(accounting for ignoreports and ignoresubdomains)
	var dochost = DustMeSelectors_tools.getEffectiveHost(doc.documentURI);
	
	//then if the autorunrestrict preference is enabled, we only want to
	//scan sites that are listed and active in the autorunhosts array
	if(DustMeSelectors_preferences.getPreference('boolean', 'autorunrestrict'))
	{
		//***DEV
		//window.content.console.log('(?) evaluating document host');
	
		//if we don't have a host then it's probably a file:// address
		//which we can't restrict by host because, er, it doesn't have a host
		if(!dochost) 
		{ 
			//***DEV
			//window.content.console.log('(\u2718) document at "'+doc.documentURI.replace(/.*\//g, '/')+'" has no host');
		
			return; 
		}
		
		//else set a flag for whether to scan this host, defaulting to false
		var active = false;
		
		//then iterate through the autorunhosts array, and if we find an 
		//active host that matches the page host, set the flag and break
		//nb. for each comparision, create a root URL and then get 
		//the effective host for that, so our host comparisions 
		//account for ignoreports and ignoresubdomains, same as the dochost
		//eg. if you listed "foo.site.com" as an autorunhost, and this page 
		//is on "bar.site.com", it would be scanned, and stored under "site.com"
		//(unless ignoresubdomains is disabled, in which case each is specific)
		//remembering to convert any port-number hashes into the colons that real URLs use
		//nb. if there are values in autorun host that aren't valid hostnames 
		//the effective host will be empty and hence it can never be active
		for(var len = DustMeSelectors_browser.autorunhosts.length, i = 0; i < len; i ++)
		{
			if(DustMeSelectors_browser.autorunhosts[i].active 
				&& 
				DustMeSelectors_tools.getEffectiveHost
					('http://' + DustMeSelectors_browser.autorunhosts[i].host.replace(/[#]/g, ':')) == dochost)
			{
				active = true;
				break;
			}
		}
	
		//then if the active flag is false, don't proceed
		if(!active)
		{
			//***DEV
			//window.content.console.log('(\u2718) document at "'+doc.documentURI.replace(/.*\//g, '/')+'" has restricted host "'+dochost+'"');
		
			return;
		}
	}
	
	
	//if we're still here, then autorun is still active 
	
	//***DEV
	//window.content.console.log('(\u2714) activate autorun page host "'+dochost+'" => STOP for '+(DustMeSelectors_tools.apuspeedCreate() * 2)+'ms');

	//so send a stop command to abandon any current scan
	//nb. we we can only process one at once, so if autorun 
	//starts in one tab then you load a page in a different tab, 
	//the first one will stop before the next one starts
	DustMeSelectors_browser.stop();
	
	
	//now get the three mutation preferences => content added to <body>, 
	//children added to <head>, or changes to attributes anywhere in the document
	//and define a flag to specify whether any of the mutations are enabled
	//nb. also save the mutations object to a global property, so we can 
	//re-connect disconnected mutations from the autorun add function
	//nb. for legacy reasons, the mutation body preference is called "mutation"
	//which is why we need to pre-define the individual preference keys
	var 
	evolve = false, 
	mutations = DustMeSelectors_browser.mutations = 
	{ 
		body 	: 'mutation', 
		head 	: 'mutationhead', 
		attrs 	: 'mutationattrs'
	};
	for(var i in mutations)
	{
		if(mutations.hasOwnProperty(i))
		{
			if(mutations[i] = DustMeSelectors_preferences.getPreference('boolean', mutations[i]))
			{
				evolve = true;
			}
		}
	}
	
	//***DEV
	//if(evolve)
	//{
	//	var keys = [];
	//	for(var i in mutations){if(mutations[i]){ keys.push(i); }}
	//	window.content.console.log('    (^) mutation observers "'+keys.join('" and "')+'" are active');
	//}
	//else { window.content.console.log('    ( ) no active mutation observers'); }
		
	//then if mutations are enabled
	if(evolve)
	{
		//define a set of observer target(s) and config data for each
		//according to which of the mutations are enabled, nullifying the 
		//non-enabled members for internal consistency (ie. so they're all objects)
		//nb. if by chance this document was authored without head or body elements
		//they'll still exist anyway in firefox's representation of the DOM
		
		//=> "body" will need "childList" and "subtree" on the <body> element
		mutations.body = !mutations.body ? null : 
		{ 
			target 	: doc.querySelector('body'),
			config	: { childList : true, subtree : true }
		};
		//=> "head" will need "childList" on the <head> element
		mutations.head = !mutations.head ? null : 
		{ 
			target 	: doc.querySelector('head'),
			config	: { childList : true }
		};
		//=> "attributes" will need "attributes" and "subtree" on the <html> element
		mutations.attrs = !mutations.attrs ? null : 
		{ 
			target 	: doc.documentElement,
			config	: { attributes : true, subtree : true }
		};
		
		//***DEV 
		//var dispatches = [];

		//now even though the mutation observers only fire a single callback
		//for any number of observed changes that happen at the same time, 
		//there will still be cases where multiple callbacks are fired in 
		//quick succession, for example with scripted animation where
		//an attribute changes or a node is inserted every few milliseconds
		//so we need to define a buffer to handle events in quick succession
		//and only trigger a single re-scan at the end of each such sequence
		//so, define a buffer object, with the speed from prefs (default = 200ms)
		//plus a property to store the transient timer reference, and a function 
		//we can use as the mutation observer callback; within that we wait 
		//for the specified time to see if another mutation occurs, and if it does 
		//then we keep on waiting, or if not then we proceed to initiate the scan
		//also get the list of attribute names whose mutations we should ignore 
		//eg. changes to the style attribute are irrelevant for our purposes
		//but it's not possible to define a list of excluded attributes, 
		//only included attributes, but there's too many possibilities to list, 
		//in fact there's an infinite number when you consider data-foo attributes
		//so we must define an exclusion list and filter the mutations manually
		//we also have to check that the mutation isn't one of our own stylesheets
		//which are added to load and parse stylesheets defined in IE conditional comments
		//because if we don't then their addition will trigger a mutation, which triggers a scan,
		//which triggers another mutation ... and so on in an infinite loop :-O
		//nb. also save the buffer object to a global property, so we can 
		//re-connect disconnected mutations from the autorun add function
		var mutationbuffer = DustMeSelectors_browser.mutationbuffer = 
		{
			speed 		: DustMeSelectors_preferences.getPreference('number', 'mutationbuffer'),
			ignoreattrs	: DustMeSelectors_preferences.getPreference
							('string', 'mutationignoreattrs').replace(/[^-\.,\w]/g, '').split(','),
			clock		: null,
			dispatcher	: function(data, observer)
			{
				//just in case the suppressed flag is true, do nothing
				if(DustMeSelectors_browser.suppressed === true) { return; }
			
				//define a flag that assumes we're going to ignore this mutation
				//then if attrs mutation is not enabled, or the data contains
				//anything that isn't a mutation of type="attributes" with a name
				//we're ignoring, then we can flip the flag and stop checking
				var relevant = !mutations.attrs;
				if(!relevant)
				{
					for(var dlen = data.length, d = 0; d < dlen; d ++)
					{
						if(!(data[d].type == 'attributes' 
								&& 
								//** this isn't substring safe, and does that matter?
								mutationbuffer.ignoreattrs.indexOf(data[d].attributeName) >= 0))
						{
							relevant = true;
							break;
						}
					}
				}
				
				//then if relevant is true and head mutations are enabled, 
				//set it back to false, then run through the list of addedNodes, 
				//and as soon as we find data that isn't a mutation of type="childList"
				//on a child of the head with a __dustmeselectors flag, flip the flag and stop
				if(relevant)
				{
					if(!(relevant = !mutations.head))
					{
						for(var dlen = data.length, d = 0; d < dlen; d ++)
						{
							if(!(data[d].type == 'childList' 
								&& 
								data[d].target == mutations.head.target))
							{
								relevant = true;
								break;
							}
							else
							{
								for(var alen = data[d].addedNodes.length, a = 0; a < alen; a ++)
								{
									if(typeof data[d].addedNodes[a].__dustmeselectors == 'undefined')
									{
										relevant = true;
										break;
									}
								}
							}
						}
					}
				}

				//***DEV
				//var mutants = {};
				//data.forEach(function(item)
				//{
				//	if(typeof mutants[item.type] == 'undefined'){mutants[item.type] = [];}
				//	var added = [];
				//	if(item.addedNodes){for(var n = 0; n < item.addedNodes.length; n ++){added.push(item.addedNodes[n].nodeName.toLowerCase());}}
				//	mutants[item.type].push('<'+item.target.nodeName+ (item.type=='attributes'?(' @'+item.attributeName):'') + (added.length>0?( '('+added.join(',')+')'):'')+ '>');
				//});
				//var str = '';
				//for(var i in mutants)
				//{
				//	str += '        ['+new Date().toISOString().replace(/Z$/,'').replace(/([^:]+:)/, '')+'] ';
				//	if(!relevant) { str += '('+mutants[i].length + ') "'+i+'" mutations TOLERATED\n'; }
				//	else { str += '('+mutants[i].length + ') "'+i+'" mutations WANTED\n'; }
				//	str += '        '+mutants[i].join(' ')+'\n';
				//}
				//dispatches.push(str);

				//but we need to make sure we don't cancel a whole sequence 
				//of buffered mutations just because one of them was irrelevant
				//so we don't start a new clock if this event is irrelevant
				//but we do still re-start the clock if it was already running
				if(relevant || mutationbuffer.clock)
				{
					//reset the clock if it's running and nullify the reference
					if(mutationbuffer.clock)
					{
						clearInterval(mutationbuffer.clock);
						mutationbuffer.clock = null;
					}
							
					//then start a [new] buffer clock, that will only finish
					//if another mutation isn't received in the meantime
					mutationbuffer.clock = setTimeout(function()
					{
						//nullify the clock reference
						mutationbuffer.clock = null;
						
						//***DEV
						//window.content.console.log('    (>) mutation observer is dispatching');
	
						//***DEV
						//window.content.console.log(dispatches.join('').replace(/\s+$/g, ''));
						//dispatches = [];
	
						//now send a stop command to abandon any current scan
						//nb. I did consider ignoring this if a scan is already running
						//but I realised we can't do that, because the added content 
						//might affect selectors that have already been scanned
						DustMeSelectors_browser.stop();
						
						//then pause for twice the apuspeed, and then 
						//kick off a new scan in the target document 
						//nb. we know by now that the tools apuspeed 
						//property is defined, because the load scan did that
						setTimeout(function()
						{
							DustMeSelectors_browser.findRedundentSelectors(doc);
						
						}, (DustMeSelectors_tools.apuspeed * 2));
	
					}, mutationbuffer.speed);		
				}
				
				//***DEV
				//else { dispatches = []; }
			}
		}

		//finally, create the mutation observer with the buffer dispatcher as its callback,
		//then iterate through the active mutations and connect each one to the observer
		//nb. save the instatiated reference to a global property, so we can 
		//disconnect and re-connect it from the autorun add and remove functions 
		//nb. and as long as we do that, we don't need to worry about adding this 
		//more than once, because it's bound to (and triggered by) the browser's 
		//content document, so it gets added when that loads, and dies when it unloads
		//but since we only have one global object, it gets re-used for each page
		//ie. we can disconnect and re-connect observers on the current document
		//if we open preferences or spider while it's there, but the only time we'll
		//be here defining them in the first place, is when a browser document loads
		DustMeSelectors_browser.observer = new MutationObserver(mutationbuffer.dispatcher);
		for(var i in mutations)
		{
			if(mutations.hasOwnProperty(i) && mutations[i])
			{
				DustMeSelectors_browser.observer.observe(mutations[i].target, mutations[i].config);
			}
		}
	}
	

	//now pause for twice the apuspeed, which is 
	//long enough to give any running scan time to stop
	setTimeout(function()
	{
		//then kick off a new scan in the target document 
		//nb. we have to pass the document reference to make sure the 
		//correct one is scanned, and that the data is stored against 
		//the correct host, since the domcontent event fires for every 
		//loaded page, even if it's in a background tab, so if we left it on
		//the default content.document, we'd always be scanning the front tab
		DustMeSelectors_browser.findRedundentSelectors(doc);
	
	//we get the APU speed from preferences, limiting and resaving if necessary, 
	//and that assigns to the tools properties which the APU uses
	}, (DustMeSelectors_tools.apuspeedCreate() * 2));
};



//menu command function: confirm set autorun preference
//nb. this is a legacy hangover, and now just a direct function call
//** so at some point we could find its callers and change them 
DustMeSelectors_browser.setAutorunPreference = function()
{
	//invert and set the autorun preference
	this.doSetAutorunPreference(true);
};


//actually set autorun preference
DustMeSelectors_browser.doSetAutorunPreference = function(invert)
{
	//get the autorun preference
	var autorun = DustMeSelectors_preferences.getPreference('boolean', 'autorun');

	//if the invert flag is true, set it to the inverse of its current value
	if(invert) { autorun = !autorun; }

	//re-save the preference
	DustMeSelectors_preferences.setPreference('boolean', 'autorun', autorun);

	//set the autorun menu item's checked value
	DustMeSelectors_browser.setUIState('autorun', !autorun);

	//re-get the autorunhosts array and update the global property
	DustMeSelectors_browser.autorunhosts = DustMeSelectors_tools.getAutorunHosts();
	
	//then add or remove the autorun domcontent listener, as applicable to the new state
	DustMeSelectors_browser[autorun ? 'addAutorunListeners' : 'removeAutorunListeners']();
};



//menu command function: open the preferences window
DustMeSelectors_browser.openPreferencesDialog = function()
{
	//if a scan is already running, do nothing (jic)
	if(DustMeSelectors.running) { return; }
	
	//else or if the spider dialog is already open, close it first
	//unless it's already running, in which case focus it and then do nothing
	if(this.spiderdialog && !this.spiderdialog.closed) 
	{ 
		if(this.spiderdialog.DustMeSelectors.running) 
		{ 
			this.spiderdialog.focus();
			return; 
		}
		this.spiderdialog.close();
	}
	
	//remove any autorun listener, because it would only be ignored while suppressed
	//and because the preferences accept function will re-apply it when closed
	//(although the fact that it uses a named rather than anonymous function, 
	// means we shouldn't ever get multiple instances)
	this.removeAutorunListeners();

	//disable the main UI
	this.setUIState('disable', true);

	//set the suppressed flag so that you can't click the icon for a find operation
	//which would otherwise be possible, because it appears that
	//image elements can't be disabled (it just looks that way because it's a gray image)
	this.suppressed = true;

	//***DEV
	//window.content.console.log('[openPreferencesDialog] suppressed = ' + DustMeSelectors_browser.suppressed);

	//if our toolbar item is not present, define a temporary observer on the toolbar, 
	//in case it's inserted while preferences is open, so it's immediatly disabled
	//(otherwise you'd be able to run scans and stuff that should be disabled)
	//nb. if our item is removed while preferences is open, and you later 
	//re-insert it (after preferences is closed) it will still be disabled, 
	//until you open and close preferences again; but there's nothing we can 
	//do about that without running this mutation observer /all the time/
	//(in fact it's possible (though unlikely) you could remove the button 
	// while a scan is running, and then it would stick in its animated state!)
	//the same thing is true for the presence or lack of the getting started item
	//** is there no way of referring to the button while it's in the (closed) palette?
	//nb. wrap the whole thing in exception handling, just so we don't
	//break the ability to open preferences if the toolbar ID changes!
	try
	{
		if(!document.getElementById('dms-toolbaritem'))
		{
			this.toolbarObserver = new MutationObserver(function(mutations) 
			{
				mutations.forEach(function(mutation)
				{
					//if nodes are added to the toolbar 
					for(var len = mutation.addedNodes.length, i = 0; i < len; i ++)
					{
						//if one of the added nodes is our toolbar item
						//nb. the node references is a constructed wrapper with id "wrapper-dms-toolbaritem"
						//but this indexOf test is safer than relying on it remaining a specific ID
						//it's also a safe test to run on undefined or null values (where a regex wouldn't be)
						if(mutation.addedNodes[i].id.indexOf('dms-toolbaritem') >= 0)
						{
							//re-disable the main UI so the item becomes disabled
							DustMeSelectors_browser.setUIState('disable', true);
					
							//and at this point we can disconnect, since all you can do now 
							//is keep adding and removing the button in the same disabled state
							DustMeSelectors_browser.toolbarObserver.disconnect();
							DustMeSelectors_browser.toolbarObserver = null;
						}
					}
				});
			});
			//nb. if the element changes its ID then this will throw an error
			this.toolbarObserver.observe(document.getElementById('nav-bar'), { childList : true  });
		}
	}
	catch(ex){}
	
	//if the preferences dialog is already open, just focus it
	if(this.prefdialog && !this.prefdialog.closed)
	{
		this.prefdialog.focus();
	}
	
	//else open the preferences dialog
	else
	{
		this.prefdialog = window.openDialog('chrome://dustmeselectors/content/preferences.xul',
			'prefdialog', 'resizable=no');

		//apply any saved dialog properties 
		DustMeSelectors_tools.applyDialogProps(this.prefdialog, 'preferences');
	}
};


//preferences dialog closed
DustMeSelectors_browser.preferencesDialogClosed = function()
{
	//set the dustme running property to false (jic)
	DustMeSelectors.running = false;
	
	//re-enable the main UI
	this.setUIState('disable', false);
	
	//if we have a toolbar observer running, 
	//disconnect it now and nullify the reference
	if(this.toolbarObserver)
	{
		this.toolbarObserver.disconnect();
		this.toolbarObserver = null;
	}

	//and clear the suppressed flag
	this.suppressed = false;

	//***DEV
	//window.content.console.log('[preferencesDialogClosed] suppressed = ' + DustMeSelectors_browser.suppressed);
};



//menu command function: open the "getting started" help guide
DustMeSelectors_browser.openStartedHelp = function()
{
	//then if we already have an open started help dialog
	if(this.startedhelpdialog && !this.startedhelpdialog.closed)
	{
		//focus the window
		this.startedhelpdialog.focus();
		
		//and then focus the browser, so that arrow-key scrolling works straight away
		this.startedhelpdialog.document.getElementById('dms-helpbrowser').focus();
	}
	
	//else we have to open a new one
	else
	{
		//open the started help dialog
		//nb. the specified size translates to pref 445x512 [on the mac]
		//(and presumably the difference is the height of the title bar)
		this.startedhelpdialog = window.openDialog(
			'chrome://dustmeselectors/content/help/startedhelpdialog.xul',
			'startedhelpdialog', 'width=445,height=490,resizable=yes,dialog=no');
		
		//apply any saved dialog properties 
		DustMeSelectors_tools.applyDialogProps(this.startedhelpdialog, 'startedhelpdialog');
		
		//then focus the window (just in case it's already open, 
		//but the triggering window is not its opener window)
		this.startedhelpdialog.focus();
	}
};



//menu command function: confirm clear saved selectors
DustMeSelectors_browser.clearSavedSelectors = function()
{
	//if the clearconfirm preference is true
	//open the clear confirm dialog
	if(DustMeSelectors_preferences.getPreference('boolean', 'clearconfirm'))
	{
		window.openDialog('chrome://dustmeselectors/content/clearconfirm.xul', 'clearconfirm', 'chrome,centerscreen,modal,resizable=no');
	}

	//otherwise just call clear the selectors straight away
	//passing the false argument to say this didn't come from the view dialog
	else
	{
		this.doClearSavedSelectors(false, null);
	}
};



//menu command function: confirm clear saved selectors for selected host
DustMeSelectors_browser.clearSavedSelectorsForSelectedHost = function(targetwindow)
{
	//if the clearconfirm preference is true
	//open the clear confirm for selected host dialog
	//as a child of the specified target window
	if(DustMeSelectors_preferences.getPreference('boolean', 'clearconfirm'))
	{
		targetwindow.openDialog('chrome://dustmeselectors/content/clearconfirmselected.xul', 'clearconfirmselected', 'chrome,centerscreen,modal,resizable=no');
	}

	//otherwise just call clear the selectors straight away
	//passing the true argument to say this came from the view dialog
	else
	{
		this.doClearSavedSelectors(true, null);
	}
};



//menu command function: confirm clear saved selectors for ALL hosts
DustMeSelectors_browser.clearAllSavedSelectors = function()
{
	//open the clearall confirm dialog
	window.openDialog('chrome://dustmeselectors/content/clearallconfirm.xul', 'clearallconfirm', 'chrome,centerscreen,modal,resizable=no');
};



//actually clear saved selectors
DustMeSelectors_browser.doClearSavedSelectors = function(fromdialog, windowobject, sitemaphost)
{
	//if this request came from the view dialog
	//we need to clear the object referred to by the hosts menu
	//so get the prefname for that host from the selectedItem
	if(fromdialog)
	{
		var prefname = this.viewdialog.document
			.getElementById('dms-hostsindexmenu').selectedItem.getAttribute('value');
	}
	
	//or if we have a sitemaphost argument, save that to the prefname instead
	else if(typeof sitemaphost != 'undefined')
	{
		prefname = sitemaphost;
	}

	//otherwise we're clearing the data indicated by the current host information
	//(for the page you're viewing) so update the control settings 
	//and copy the returned global prefname to the local prefname var
	else
	{
		prefname = this.updateControlSettings(window.content.document.location);
	}
	
	//try to move all files to trash and delete this host from the hostsindex
	//nb. we do this without checking that the data is actually there, 
	//because the menuitems themselves are selectively enabled and disabled, 
	//according to the current view host, as their menupopup is triggered
	DustMeSelectors_filesystem.moveToTrash(prefname + '.json');
	DustMeSelectors_filesystem.moveToTrash(prefname.replace('selectors', 'log') + '.json');
	DustMeSelectors_filesystem.moveToTrash(prefname.replace('selectors', 'used') + '.json');
	DustMeSelectors_tools.updateHostsIndex({ 'host' : prefname }, false);

	//if the viewdialog is present 
	if(this.viewdialog && !this.viewdialog.closed)
	{
		//show the viewfooter groupbox and hide the viewcleaning controls, jic
		this.viewdialog.document.getElementById('dms-viewfooter').setAttribute('hidden', false);
		this.viewdialog.document.getElementById('dms-viewcleaning').setAttribute('hidden', true);

		//if the preference name matches the the currently viewing data
		//clear the appropriate UI components [and update the hostsindex selector]
		if(prefname == this.viewdialog.document.getElementById('dms-hostsindexmenu').selectedItem.getAttribute('value'))
		{
			this.clearViewDialog(this.viewdialog.document);
		}

		//otherwise just update the hosts index selector
		else
		{
			this.populateHostsIndexMenu(this.viewdialog.document, false);
		}
		
		//hide the "spider sitemap" button, and hide and disable the "resume" button
		this.setUIState('viewspider', true);
		
	}

	//if this request didn't come from the view dialog
	//or it did, but the selected host is this host
	if(!fromdialog || prefname == this.prefname)
	{
		//send a stop command in case the find is running when you do this
		//(even though the menu items are disabled at the time, 
		// it's as well to cover every possibility with this)
		this.stop();
	}
	
	//if the spider dialog is present but the sitemaphost argument is undefined
	//(it will be defined if the command came from the "trash then re-spider" option
	//and in that case we don't want to mess with the spider dialog's UI during that operation
	if((this.spiderdialog && !this.spiderdialog.closed) && typeof sitemaphost == 'undefined')
	{
		//re-build the sitemaps array that's used for toggling the start/resume button
		this.spiderdialog.DustMeSelectors_spider.buildSitemaps();
		
		//if the spider isn't actually running, show the "go" button
		if(!this.spiderdialog.DustMeSelectors.running)
		{
			this.spiderdialog.DustMeSelectors_spider.setUIState('urlgroup', 0);
		}
	}

	//if we now have no host data at all, disable the clear menu altogether
	//nb. we don't need to clear the view item because that's already been done
	if(DustMeSelectors_tools.count(DustMeSelectors_tools.getHostsIndex()) == 0)
	{
		this.setUIState('clearmenu', true);
	}

	//if we have a window object it means this is clearconfirm dialog with a checkbox
	//so in that case get the checked value and set the clearconfirm preference accordingly
	if(windowobject !== null)
	{
		DustMeSelectors_preferences.setPreference('boolean', 'clearconfirm',
			(windowobject.document.getElementById('dms-clearconfirm-clearconfirm')
				.getAttribute('checked') == 'true' ? true : false));
	}
};



//actually clear all saved selectors
DustMeSelectors_browser.doClearAllSavedSelectors = function()
{
	//move all files to trash
	for(var i in DustMeSelectors_tools.hostsindex)
	{
		if(!DustMeSelectors_tools.hostsindex.hasOwnProperty(i)) { continue; }
		
		DustMeSelectors_filesystem.moveToTrash(DustMeSelectors_tools.hostsindex[i].host + '.json');
		DustMeSelectors_filesystem.moveToTrash(DustMeSelectors_tools.hostsindex[i].host.replace('selectors.', 'log.') + '.json');
		DustMeSelectors_filesystem.moveToTrash(DustMeSelectors_tools.hostsindex[i].host.replace('selectors.', 'used.') + '.json');
	}

	//empty the hosts array and save an empty JSON string back to the hostsindex file
	//we don't want to delete the hosts index, we want to keep it but be empty
	DustMeSelectors_tools.hostsindex = [];
	DustMeSelectors_filesystem.dumpToFile('hostsindex.json', '{}');

	//if the viewdialog is present
	if(this.viewdialog && !this.viewdialog.closed)
	{
		//show the viewfooter groupbox and hide the viewcleaning controls, jic
		this.viewdialog.document.getElementById('dms-viewfooter').setAttribute('hidden', false);
		this.viewdialog.document.getElementById('dms-viewcleaning').setAttribute('hidden', true);

		//clear the appropriate UI components [and update the hostsindex selector]
		this.clearViewDialog(this.viewdialog.document);
	}

	//disable the view item and clear menu
	this.setUIState('view-clearmenu', true);

	//*** why is this necessary?
	setTimeout(function(){ DustMeSelectors_browser.setUIState('clearmenu', true); },100);
	
	//send a stop command in case the find is running when you do this
	//(even though the triggering items are disabled now anyway, 
	// it's as well to cover every possibility with this)
	this.stop();
};



//menu command function: spider this page
DustMeSelectors_browser.spiderThisPage = function(url)
{
	//ignore this if the spider is currently running 
	//nb. we have this condition so that the contextmenu item 
	//can remain permanently enabled without causing a problem
	if(DustMeSelectors.running) { return; }
	
	//otherwise open the spider dialog with the url as its prefill argument
	DustMeSelectors_browser.openSpiderDialog(url);
};



//menu command function: open spider dialog
DustMeSelectors_browser.openSpiderDialog = function(prefill)
{
	//if the extension hasn't yet been initialized this session, 
	//then it's because this command has fired before the chrome load event
	//so we'll just have to reject the command and make the user try again
	//(as a simpler alternative to pre-disabling every single UI item,
	// although that's already what happens with the view and clear items)
	if(!DustMeSelectors_browser.beeninitialised) { return; }

	//***DEV
	//window.content.console.log('[openSpiderDialog::before] suppressed = ' + DustMeSelectors_browser.suppressed); 
	//window.content.console.log('[openSpiderDialog::before] scan running = ' + DustMeSelectors.running);
	
	//if the scan is already running, do nothing
	if(DustMeSelectors.running) { return; }

	//or if the suppressed flag is already enabled
	if(this.suppressed === true) 
	{ 
		//if the spider dialog is open
		if(this.spiderdialog && !this.spiderdialog.closed)
		{
			//***DEV
			//window.content.console.log('[openSpiderDialog::before] spider running = ' + this.spiderdialog.DustMeSelectors.running);
			
			//if we have a prefill argument and the spider isn't already running
			//call the dialog loaded method to prefil the sitemap URL and focus the start button
			if(typeof prefill != 'undefined' && this.spiderdialog.DustMeSelectors.running !== true)
			{
				this.spiderDialogLoaded(prefill);
			}
			
			//focus the spider dialog either way
			this.spiderdialog.focus();
		}
		
		//and we're done here
		return; 
	}

	//remove any autorun listener, because it would only be ignored while suppressed
	//(but this of course means we have to add it again when the dialog is closed)
	this.removeAutorunListeners();

	//disable the main UI
	this.setUIState('disable', true);

	//set the suppressed flag so that you can't click the icon for a find operation
	//which would otherwise be possible, because it appears that
	//image elements can't be disabled (it just looks that way because it's a gray image)
	this.suppressed = true;

	//***DEV
	//window.content.console.log('[openSpiderDialog::after] suppressed = ' + DustMeSelectors_browser.suppressed);

	//if we already have an open spider dialog, focus the window 
	//then call its loaded method directly, passing the prefill string (or undefined)
	if(this.spiderdialog && !this.spiderdialog.closed)
	{
		this.spiderDialogLoaded(prefill);
	}

	//otherwise we need to open a new one
	else
	{
		//open the spider dialog, with zero height so it sizes to content
		this.spiderdialog = window.openDialog('chrome://dustmeselectors/content/spider.xul',
			'spiderdialog', 'width=440,height=0,resizable=no');
	
		//apply any saved dialog properties 
		DustMeSelectors_tools.applyDialogProps(this.spiderdialog, 'spiderdialog');

		//when the window has loaded, call its loaded method, 
		//passing the prefill string (or undefined)
		this.spiderdialog.addEventListener('load', function()
		{
			DustMeSelectors_browser.spiderDialogLoaded(prefill);
		
		}, false);
	}
	
	//focus the dialog
	this.spiderdialog.focus();
};


//spider dialog load handler
DustMeSelectors_browser.spiderDialogLoaded = function(prefill)
{
	//update any windows-specific language, which we can 
	//identify by the "winnt-lang" class on each affected element
	//then a "dms:winnt-foo" attribute that stores the windows language
	//ie. dms:winnt-label would replace the default label attribute
	//nb. doing it this way rather than applying stringbundle values 
	//means that the language can all be defined in the same DTD and XML
	if(DustMeSelectors_tools.platform == 'winnt')
	{
		var winntnodes = this.spiderdialog.document.getElementsByClassName('winnt-lang');
		for(var len = winntnodes.length, i = 0; i < len; i ++)
		{
			var attrs = winntnodes[i].attributes;
			for(var alen = attrs.length, a = 0; a < alen; a ++)
			{
				if(attrs[a].name.indexOf('dms:winnt-') >= 0)
				{
					winntnodes[i].setAttribute(attrs[a].name.split('dms:winnt-')[1], attrs[a].value);
				}
			}
		}
	}
	

	//get a reference to the sitemap URL textbox
	var mapinput = this.spiderdialog.document.getElementById('dms-spider-mapurl');
	
	//if the "spidertitles" preference is enabled, add the "showcommentcolumn" 
	//attribute to the textbox, which sets that option on the autocomplete menu
	if(DustMeSelectors_preferences.getPreference('boolean','spidertitles'))
	{
		mapinput.setAttribute('showcommentcolumn', true);
	}


	//then if the spider isn't already running
	if(!this.spiderdialog.DustMeSelectors.running)
	{
		//if we don't have a prefill command string, but we do have a 
		//non-empty mapurl preference, and spiderpersist is enabled
		//copy the preference value to the prefill string 
		//but define a flag to remember that this was persistence
		//nb. the preference provides persistence for typed values 
		//since textbox persist doesn't work (perhaps because it's autocomplete)
		//but we only want to use it if we don't already have a prefill
		//so that it doens't override the URLs sent from "spider this page"
		//* but if you use the "spider this page" shortcut on a page like about:blank
		//* the prefill will be an empty string but the persitent value won't be applied
		if(typeof prefill == 'undefined' && DustMeSelectors_preferences.getPreference('boolean','spiderpersist'))
		{
			var persistence = true;
			if(!(prefill = DustMeSelectors_preferences.getPreference('string','mapurl')))
			{
				prefill = null;
			}
		}
		else { persistence = false; }
		
		//then if we [now] have a prefill command string
		//we need to pre-fill the URL textbox with it
		//and then update the appropriate UI items
		if(typeof prefill == 'string')
		{
			//if the viewdialog is open and we have a non-empty selected item
			//then this will have been called from a spider shortcut button in the footer
			if(this.viewdialog && !this.viewdialog.closed)
			{
				var menuhost = this.viewdialog.document.getElementById('dms-hostsindexmenu').selectedItem;
				if(menuhost)
				{
					//save the name of the selected host
					var selectedhost = menuhost.getAttribute('value');
					
					//if the host is not the hidden empty item
					//nb. this is jic because we shouldn't get this far if so
					//(since the triggering buttons and items will be disabled or hidden)
					if(selectedhost !== '')
					{
						//if the prefill string is "host"
						if(prefill == 'host')
						{
							//then set the mapinput value to the selected host's http web root, 
							//which we guess is the home page (or or least, a good place to start)
							//UNLESS this is the globally saved host, so we don't write "http://Globally saved host/"
							if(selectedhost != 'selectors')
							{
								mapinput.value = 'http://' + menuhost.getAttribute('label') + '/';
							}
			
							//show the "go" button in the spider dialog
							DustMeSelectors_browser.spiderdialog.DustMeSelectors_spider.setUIState('urlgroup', 0);
						
							//then auto-select the value for over-typing
							//so that they can easily reject this value for something else
							//we also have to pre-focus the textbox, or this doesn't always work
							mapinput.focus();
							mapinput.selectionStart = 0;
							mapinput.selectionEnd = mapinput.value.length;
						}
						
						//or if the prefill string is "sitemap"
						else if(prefill == 'sitemap')
						{
							//since the prefill is sitemap then we know this site has been spidered
							//so its host data will include the sitemap URL
							//so iterate through the hostsindex and find this host
							for(var i in DustMeSelectors_tools.hostsindex)
							{
								if(!DustMeSelectors_tools.hostsindex.hasOwnProperty(i)) { continue; }
								
								if(selectedhost == DustMeSelectors_tools.hostsindex[i].host)
								{
									var sitemap = DustMeSelectors_tools.hostsindex[i].sitemap;				
									break;
								}
							}
							
							//if we don't have a sitemap defined for this host 
							//it will only be because the hostsindex includes legacy data 
							//from before we recorded the sitemap URL as part of the host data 
							if(typeof sitemap == 'undefined')
							{
								//so we'll have to get it the hard way, by opening the logdata
								//associated with this host, and extracting the sitemap from its baseurl property
								var log = DustMeSelectors_tools.getDataObject(selectedhost, 'log', null);
								var sitemap = log.baseurl;
							}
			
							//then if we [now] have a sitemap address defined
							if(typeof sitemap != 'undefined')
							{
								//set the mapinput value to the sitemap URL
								mapinput.value = sitemap;
								
								//show the "resume" button in the spider dialog
								DustMeSelectors_browser.spiderdialog.DustMeSelectors_spider.setUIState('urlgroup', 2);
							
								//then focus the "resume" button rather than auto-selecting the value
								//since it's already correct, the user will just want to start
								//(even though you can in fact just press enter from the textbox, 
								// this is still the more usable/intuitive thing to do)
								//but we do have to wait a fraction before doing that, 
								//so that we override the spider dialog's own onload->textbox focus 
								window.setTimeout(function()
								{
									DustMeSelectors_browser.spiderdialog.document.getElementById('dms-spider-resumebutton').focus();
								
								},10);
							}
						}
					}
				}
			}
			
			//either way, if the string is a valid URL
			//(which we can most easily check by getting its effective host)
			if(DustMeSelectors_tools.getEffectiveHost(prefill))
			{
				//write the URL to the mapinput
				mapinput.value = prefill;
				
				//if this is a persistence, focus the field and select the whole value
				//so you can start over-typing immediately
				if(persistence === true)
				{
					mapinput.focus();
					mapinput.selectionStart = 0;
					mapinput.selectionEnd = mapinput.value.length;
				}
				
				//update the mapurl persistence preference
				//nb. and it's simplest to do this whether or not 
				//spiderpersist is enabled, then only apply it to the mapinput if so
				DustMeSelectors_preferences.setPreference('string', 'mapurl', prefill);
			
				//now wait a fraction before doing this
				//or it doesn't always work when the spider dialog wasn't already open
				window.setTimeout(function()
				{
					//call the spider dialog's setUIState "urlgroup" command
					//passing the result of sending the URL to the isSitemapURI function
					//this will determine which button to show, and return a button reference
					var button = DustMeSelectors_browser.spiderdialog.DustMeSelectors_spider.setUIState(
						'urlgroup', 
						DustMeSelectors_browser.spiderdialog.DustMeSelectors_spider.isSitemapURI(mapinput.value)
						);
					
					//then if this is NOT persistence, focus the referenced button
					if(persistence !== true)
					{
						button.focus();
					}
				
				},10);
			}
			
			//otherwise just focus the mapinput
			else
			{
				mapinput.focus();
			}
			
			//finally, whatever the prefill was, if the mapinput now has a value
			//then try to get a favicon for it from the local store 
			//passing false for the load argument so we don't try to load a new one
			//we just show the default favicon if there isn't a custom one
			DustMeSelectors_tools.getFavicon(mapinput.value, false, function(favicon)
			{
				if(favicon)
				{
					mapinput.style.listStyleImage = 'url(' + favicon + ')';
				}
			});
			
		}
		
		//otherwise just focus the mapinput 
		else
		{
			mapinput.focus();
		}
	}
};


//spider dialog closed
DustMeSelectors_browser.spiderDialogClosed = function()
{
	//set the dustme running property to false
	//so that the stop command cascades into the dustme script
	//nb. this is already done by the window's pre-close events
	//but let's do it again just to be double sure :-)
	DustMeSelectors.running = false;
	
	//re-active the autorun preference, passing the false invert flag
	//so that the listener is only added if autorun is enabled
	this.doSetAutorunPreference(false);

	//re-enable the main UI
	this.setUIState('disable', false);

	//and clear the suppressed flag
	this.suppressed = false;

	//***DEV
	//window.content.console.log('[spiderDialogClosed] suppressed = ' + DustMeSelectors_browser.suppressed);
};


//menu command function: view saved selectors
DustMeSelectors_browser.viewSavedSelectors = function(prefname, forcetab, direct)
{
	//if the extension hasn't yet been initialized this session, 
	//then it's because this command has fired before the chrome load event
	//so we'll just have to reject the command and make the user try again
	//(as a simpler alternative to pre-disabling every single UI item,
	// although that's already what happens with the view and clear items)
	if(!DustMeSelectors_browser.beeninitialised) { return; }

	//if no input preference name is specified, or it's null
	//update the control settings (for the page you're viewing) 
	//and then copy the prefname to a local value
	if(typeof prefname == 'undefined' || prefname === null)
	{
		prefname = DustMeSelectors_browser.updateControlSettings(window.content.document.location);
	}

	//if no forcetab argument is specified or it's null, default it to false
	if(typeof forcetab == 'undefined' || forcetab === null) 
	{ 
		forcetab = false; 
	}

	//if not direct argument is specified or it's null, default it to false
	if(typeof direct == 'undefined' || direct === null) 
	{ 
		direct = false; 
	}
	
	//get the selectors object for the selected host
	var selectors = DustMeSelectors_tools.getDataObject(prefname, 'selectors', {});

	//if the returned value is a string, then it will be an error message
	if(typeof selectors == 'string')
	{
		//save the error message separately
		DustMeSelectors_browser.dataerror = selectors;

		//create an empty selectors object
		selectors = {};
	}

	//count the number of groups in the selectors object
	var groupcount = 0;
	for(var i in selectors)
	{
		if(!selectors.hasOwnProperty(i)) { continue; }
		groupcount++;
	}

	//if there are no members then we have no stylesheets
	if(groupcount == 0)
	{
		//hide the status label
		//** this probably isn't necessary, it should already be hidden
		DustMeSelectors_browser.hideStatusLabel();
	}

	//if we already have an open view dialog
	if(DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
	{
		//call the view dialog loaded method directly
		DustMeSelectors_browser.viewDialogLoaded(selectors, groupcount, prefname, forcetab);

		//if this is a direct command, focus the window
		//so it will come to view if requested and hidden
		//but not if called programatticaly
		if(direct) { DustMeSelectors_browser.viewdialog.focus(); }
	}

	//otherwise if the openview flag is true we want to open it
	else if(DustMeSelectors_browser.openview)
	{
		//define hasevents properties to prevent multiple listeners being added
		DustMeSelectors_browser.hasevents = { 'selectors' : false, 'used' : false, 'log' : false };

		//open the view selectors dialog 
		//nb. the saved pref for this height will be slightly larger
		//because of the title bar, eg. on the mac it's 680x622
		DustMeSelectors_browser.viewdialog = window.openDialog(
			'chrome://dustmeselectors/content/viewdialog.xul',
			'viewdialog', 'width=680,height=600,resizable=yes,dialog=no');

		//apply any saved dialog properties 
		DustMeSelectors_tools.applyDialogProps(DustMeSelectors_browser.viewdialog, 'viewselectors');

		//when the window has loaded, pass the selectors object
		//group count and preference name and forcetab argument to the view dialog loaded method
		DustMeSelectors_browser.viewdialog.addEventListener('load', function()
		{
			DustMeSelectors_browser.viewDialogLoaded(selectors, groupcount, prefname, forcetab);

		}, false);
	}

	//set the openview flag to true
	//so that subsequent manual open operations work
	DustMeSelectors_browser.openview = true;
};



//view selectors dialog window loaded handler
DustMeSelectors_browser.viewDialogLoaded = function(selectors, groupcount, prefname, forcetab)
{
	//save a reference to the viewdialog document
	//and a reference to the content document in the viewselectors browser
	var viewdoc = this.viewdialog.document;
	var doc = viewdoc.getElementById('dms-viewselectorsbrowser').contentDocument;

	//clear the dialog browsers
	this.clearBrowserDocument('dms-viewselectorsbrowser');
	this.clearBrowserDocument('dms-viewusedbrowser');
	this.clearBrowserDocument('dms-viewlogbrowser');

	//clear the view summary element
	this.updateViewSummary(null, null, null, null, null, null);

	//show the viewfooter groupbox and hide the viewcleaning controls, jic
	viewdoc.getElementById('dms-viewfooter').setAttribute('hidden', false);
	viewdoc.getElementById('dms-viewcleaning').setAttribute('hidden', true);

	//if the forcetab argument is true, preset the selectors tab
	//this will apply during a regular find operation
	//to save the pointlessness of getting log information
	//but during a spider operation it will be false
	//so that a log view is not interrupted when it might be relevant
	if(forcetab) { viewdoc.getElementById('dms-viewtabs').selectedIndex = 0; }

	//populate and preselect the hosts index menu
	this.populateHostsIndexMenu(viewdoc, true);

	//then if we have data for the currently viewing host
	if(DustMeSelectors_tools.haveDataForHost(prefname))
	{
		//pass the document references, the selectors object and its meta-data,
		//a fixed datatype value ('selectors') and the update status flag
		//to the populate selectors information method
		//nb. we send this fixed datatype because unused selectors is the default tab
		this.populateSelectorsInformation(viewdoc, doc, selectors, groupcount, 'selectors', true);

		//then we're done
		return;
	}
	
	//if we're still going then we have no data for this host (or no host is selected)
	//so disable the save and clear buttons
	viewdoc.getElementById('dms-viewactions-save').setAttribute('disabled', true);
	viewdoc.getElementById('dms-viewactions-clear').setAttribute('disabled', true);
	
	//then create an item at the end of the menupop with a single space for its label
	//then set that to the selectedItem, but also make it hidden within its menu
	//nb. this is so the menulist retains its height, since it still has a selection 
	//but the empty item doesn't show up in the menulist, so it can't be selected
	//now that we have this, we need to account for it wherever the selectedItem 
	//is referred to, to make sure it isn't handling an empty string, 
	//but we can also use it to detect when there's a selection 
	//(in fact we have to) because the selectedIndex will now never be -1
	var menulist = viewdoc.getElementById('dms-hostsindexmenu');
	var menuitem = menulist.getElementsByTagName('menupopup').item(0)
		.appendChild(viewdoc.createElement('menuitem'));
	menuitem.setAttribute('value', '');
	menuitem.setAttribute('hidden', 'true');
	menuitem.setAttribute('label', '\u00a0');
	menulist.selectedItem = menuitem;


	//for each of the view browser keys
	var browsernames = ['selectors', 'used', 'log'];
	for(var i=0; i<3; i++)
	{
		//get a reference to the browser element
		var browser = viewdoc.getElementById('dms-view' + browsernames[i] + 'browser');

		//then only if we actually have data for any hosts
		//** is there a practical but more efficient way of getting this zero count
		if(DustMeSelectors_tools.count(DustMeSelectors_tools.getHostsIndex()) > 0)
		{
			//output the prompt message into its content document
			//to tell the user [how] to [re-]select view data		
			var h2 = browser.contentDocument.querySelector('body').appendChild(viewdoc.createElement('h2'));
			h2.appendChild(viewdoc.createTextNode(DustMeSelectors_tools.bundle.getString('view.prompt')));
		}
		
		//block the contextmenu event when the menu is disabled or no host is selected
		//so you can't make it show the sliver of empty menu in an empty selectors view
		browser.addEventListener('contextmenu', function(e)
		{
			var hostsmenu = viewdoc.getElementById('dms-hostsindexmenu');
			if(hostsmenu.disabled || hostsmenu.selectedItem.getAttribute('value') == '')
			{
				e.preventDefault();
				e.stopPropagation();
			}
		}, false);
	}
};



//populate the hosts index menu
DustMeSelectors_browser.populateHostsIndexMenu = function(doc, preselect)
{
	//get references to the menulist and its menupopup element
	var 
	menulist = doc.getElementById('dms-hostsindexmenu'),
	menupopup = menulist.getElementsByTagName('menupopup').item(0);

	//reset any list-style-image on the menulist
	menulist.style.listStyleImage = 'none';
	
	//clear all existing items from the menupopup
	while(menupopup.hasChildNodes())
	{
		menupopup.removeChild(menupopup.firstChild);
	}

	//create an array of hosts from the hostsindex object 
	//then sort it alphabetically so we can create an, er, alphabetical list
	var hosts = [];
	for(var i in DustMeSelectors_tools.hostsindex)
	{
		if(DustMeSelectors_tools.hostsindex.hasOwnProperty(i))
		{
			hosts.push(DustMeSelectors_tools.hostsindex[i].host);
		}
	}
	hosts.sort(function(a, b)
	{
		var x = a.toLowerCase(), y = b.toLowerCase();
		return x < y ? -1 : x > y ? 1 : 0;
	});

	//to compile the menu we need to do several discrete iterations
	//so that we can put the global and local items at the top
	//irrespective of their position in the hostsindex array

	//we also needto remember whether we had either
	//so we know whether to draw a divider before the other items
	var haveglobalorlocal = false;

	//first add a menu item for the global preference, if it exists
	for(var i=0; i<hosts.length; i++)
	{
		//if the value is just "selectors" then this is the global preference data
		//stored when per-host saving is off, or from a legacy version
		if(hosts[i] === 'selectors')
		{
			//create the menu item and set its value and label
			//using the globalprefs string
			var menuitem = menupopup.appendChild(doc.createElement('menuitem'));
			menuitem.setAttribute('value', 'selectors');
			menuitem.setAttribute('label', DustMeSelectors_tools.bundle.getString('view.globalprefs'));

			/*** TBI ***//*
			//set a dms:favicon attribute with the value "none"
			//that can be applied as list-style-image to the parent menulist onchange
			menuitem.setAttributeNS('http://www.brothercake.com/dustmeselectors', 'dms:favicon', 'none');
			*/
			
			//remember that we have a global or local value
			haveglobalorlocal = true;

			//we're done now
			break;
		}
	}

	//then add an item for local file data, if its exists
	for(i=0; i<hosts.length; i++)
	{
		//if the value is "@local" then this is local files data
		if(hosts[i] === 'selectors.@local')
		{
			//create the menu item and set its value and label
			//using the localfiles string
			var menuitem = menupopup.appendChild(doc.createElement('menuitem'));
			menuitem.setAttribute('value', 'selectors.@local');
			menuitem.setAttribute('label', DustMeSelectors_tools.bundle.getString('view.localfiles'));

			/*** TBI ***//*
			//set a dms:favicon attribute with the value "none"
			//that can be applied as list-style-image to the parent menulist onchange
			menuitem.setAttributeNS('http://www.brothercake.com/dustmeselectors', 'dms:favicon', 'none');
			*/
			
			//remember that we have a global or local value
			haveglobalorlocal = true;

			//we're done now
			break;
		}
	}

	//then add a new menu item for each of the subsequent hosts in the hostsindex
	for(i=0; i<hosts.length; i++)
	{
		//ignore global and local data in this main iteration
		if(hosts[i] === 'selectors' || hosts[i] === 'selectors.@local') { continue; }

		//if we haven't already done so, and if we have a global or local value, add a divider
		if(typeof separator == 'undefined' && haveglobalorlocal)
		{
			var separator = menupopup.appendChild(doc.createElement('menuseparator'));
		}

		//create the menu item and set its value and label
		//from the data in the hostsindex array
		//converting any port-number hashes into colons for the label
		var menuitem = menupopup.appendChild(doc.createElement('menuitem'));
		menuitem.setAttribute('value', hosts[i]);
		var hostname = hosts[i].replace('selectors.', '').replace(/\#([0-9]+)/, ':$1');
		menuitem.setAttribute('label', hostname);

		/*** TBI ***//*
		//now try to get a favicon for this host's http root
		//passing false for the load argument so we don't try to load a new one
		//nb. and since we're not loading the process will be synchronous
		//so we don't need to worry about the loss of reference from asynchronous use
		//*** but this won't usually work, because the favicon will be saved under 
		//*** the sitemap URL, not the www-excluded http root value we have here
		DustMeSelectors_tools.getFavicon('http://' + hostname, false, function(favicon)
		{
			if(favicon)
			{
				//apply the favicon to the menuitem's list-style-image 
				menuitem.setAttribute('style', 'list-style-image:url(' + favicon + ')');

				//also save it as a custom attribute, so that we can 
				//easily apply the same favicon to the parent menulist onchange
				//and save it in the form of a "url()" value, which we can then 
				//apply directly to list-style-image, and do the same thing 
				//with the global/local items by settings it attribute to "none"
				menuitem.setAttributeNS(
					'http://www.brothercake.com/dustmeselectors',
					'dms:favicon',
					'url(' + favicon + ')'
					);
			}
		});
		*/
	}

	//then if we're preselecting, iterate through the created menu
	//to look for the item to preselect, and preselect it
	if(preselect)
	{
		var items = menupopup.getElementsByTagName('menuitem');
		for(i=0; i<items.length; i++)
		{
			if(items[i].getAttribute('value') == this.prefname)
			{
				menulist.selectedItem = items[i];
				/*** TBI ***//*
				menulist.style.listStyleImage = items[i].getAttributeNS('http://www.brothercake.com/dustmeselectors', 'favicon');
				*/
				break;
			}
		}
	}
	
	//then disable or enable the menulist and label
	//according to whether we actually have any hosts data
	//(but don't disable the tabs, cos that looks weird to me)
	//nb. this isn't strictly necessary, but it avoids the appearance 
	//of a tiny sliver of empty menupopup if you click it when it's empty
	//it also means that if you have the dialog visible but empty in the background
	//then you start spidering a site, you'll see the menulist and label become
	//enabled as soon as the first data from the spider becomes available :-)
	//** is there a practical but more efficient way of getting this zero count
	menulist.disabled = (DustMeSelectors_tools.count(DustMeSelectors_tools.getHostsIndex()) == 0);
	doc.getElementById('dms-hostsindexlabel').disabled = menulist.disabled;
};



//menu command function: respond to view dialog tab selection
//and pass the event to view saved data for host
DustMeSelectors_browser.tabSelect = function(host)
{
	this.viewSavedDataForHost(host, false);
};


//menu command function: view saved data for a stored host
DustMeSelectors_browser.viewSavedDataForHost = function(host, isnew)
{
	//get a reference to the dialog document
	//and also to the hostsindex menulist
	var 
	viewdoc = this.viewdialog.document,
	menulist = viewdoc.getElementById('dms-hostsindexmenu');
	
	/*** TBI ***//*
	//then udpate the menulist's list-style-image according to the selection
	//using the selected item's dms:favicon attribute, 
	//or clearing the property entirely if there is no selection
	menulist.style.listStyleImage = 
		(menulist.selectedItem && menulist.selectedItem.getAttribute('value') !== '')
			? menulist.selectedItem.getAttributeNS('http://www.brothercake.com/dustmeselectors', 'favicon')
			: 'none';
	*/
	
	//if this is a new instance, ie. opening the dialog, refreshing with the 
	//data from a scan or spider operation, or seleting from the hosts menu,
	//as opposed to merely switching between the different tabs
	if(isnew)
	{
		//if we have an active master cleaning processor, abort the APUs
		if(DustMeSelectors.processors && DustMeSelectors.processors.master)
		{
			DustMeSelectors.processors.master.abort();
		}
	
		//and if we have any active cleaningdata, delete it so the view can reset
		if(DustMeSelectors_browser.cleaningdata)
		{
			delete DustMeSelectors_browser.cleaningdata;
		}
	
		//then call the dialog browser clear function, passing the clearmark flag
		//which tells it not to actually clear the browsers, because clearing 
		//all three at the same time is the heaviest and slowest process
		//and each individual browser will be cleared when its tab is selected
		//so instead, it sets an attribute on the browser that says it can be cleared
		//which will then be taken to mean we can proceed as though it were already clear 
		this.clearBrowserDocument('dms-viewselectorsbrowser', true);
		this.clearBrowserDocument('dms-viewusedbrowser', true);
		this.clearBrowserDocument('dms-viewlogbrowser', true);
	}

	//show the viewfooter groupbox and hide the viewcleaning controls, 
	//just in case this happens while a cleaning operation is in progress 
	//(which will itself detect the possibility and abandon its process accordingly)
	viewdoc.getElementById('dms-viewfooter').setAttribute('hidden', false);
	viewdoc.getElementById('dms-viewcleaning').setAttribute('hidden', true);

	//hide the "spider sitemap" button, and hide and disable the "resume" button
	this.setUIState('viewspider', true);
	
	//disable the spider tab for "selectors.@local" or enable it for any other host
	//nb. you can't spider a sitemap on the local filesystem, only across http
	viewdoc.getElementById('dms-viewtab-spider')
		.setAttribute('disabled', (host == 'selectors.@local' ? 'true' : 'false'));
		
	//then if the hosts menu selection is the hidden empty item, we're done here
	if(menulist.selectedItem.getAttribute('value') === '') { return; }
	

	//get the selected tab in the tabbrowser
	var tab = viewdoc.getElementById('dms-viewtabs').selectedItem;

	//now switch according to its id (which tab is selected)
	switch(tab.id)
	{
		//the selectors tab
		case 'dms-viewtab-selectors' :

			//view the saved selectors for this host
			this.viewSavedSelectorsForHost(host, 'selectors');
			break;

		//the used selectors tab
		case 'dms-viewtab-used' :

			//view the used selectors for this host
			this.viewSavedSelectorsForHost(host, 'used');
			break;

		//the spider log tab
		case 'dms-viewtab-spider' :

			//but if we disabled the spider tab while its panel was selected
			//we need to select a different tab instead, 
			//which may as well be "selectors" since that's the default
			//so select that tab, then view saved selectors for this host
			if(tab.disabled)
			{
				viewdoc.getElementById('dms-viewtabs').selectedIndex = 0;
				this.viewSavedSelectorsForHost(host, 'selectors');
			}

			//otherwise iew the spider log for this host as normal
			else { this.viewSpiderLogForHost(host); }
			
			break;
	}
};


//view saved selectors for a stored host
DustMeSelectors_browser.viewSavedSelectorsForHost = function(host, datatype)
{
	//if this is the unused selectors tab and we have active cleaning data 
	//then the user will have switched to the used or log tab, then back to this one 
	//while the results of a cleaning operation are still shown in the browser
	//so we just need to re-update the view cleaning summary and show the cleaning controls
	if(datatype == 'selectors' && DustMeSelectors_browser.cleaningdata)
	{
		DustMeSelectors_browser.updateCleaningSummary();
		return;
	}

	//else get a reference to the dialog document, and the content document in the dialog's browser
	var viewdoc = this.viewdialog.document;
	var doc = viewdoc.getElementById('dms-view' + datatype + 'browser').contentDocument;

	//get the selectors or used object for the selected host
	var data = DustMeSelectors_tools.getDataObject(host, datatype, {});
	
	//then pass it to the view-summary-totals method, to get an object of totals
	var totals = DustMeSelectors_tools.getViewSummaryTotals(data);

	//if the data is not empty update with this information
	//otherwise update with the "no stylesheets" message
	if(totals.sheets > 0)
	{
		this.updateViewSummary(totals.rules, totals.sheets, null, datatype, null, null);
	}
	else
	{
		this.updateViewSummary(0, 0, null, datatype, null, DustMeSelectors_tools.bundle.getString('view.none'));
	}

	//if the browser document body already has any child nodes, we're done
	//unless the owning browser has the clearmark attribute
	if(doc.querySelector('body').hasChildNodes() 
		&& !viewdoc.getElementById('dms-view' + datatype + 'browser')
			.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) { return; }

	//pass the document references, the selectors/used object and its meta-data,
	//the datatype and a false update status flag
	//to the populate selectors information method
	this.populateSelectorsInformation(viewdoc, doc, data, totals.groups, datatype, false);
};



//clear the selectors and log dialogs for the selected host
//in response to a "clear this data" command
DustMeSelectors_browser.clearViewDialog = function(viewdoc)
{
	//get a reference to the hosts index menu
	var menulist = viewdoc.getElementById('dms-hostsindexmenu');
	
	//reset any list-style-image
	menulist.style.listStyleImage = 'none';
	
	//disable the save and clear buttons
	viewdoc.getElementById('dms-viewactions-save').setAttribute('disabled', true);
	viewdoc.getElementById('dms-viewactions-clear').setAttribute('disabled', true);

	//re-populate the hosts index menu
	//but don't preselect any item
	this.populateHostsIndexMenu(viewdoc, false);
	
	//create an item at the end of the menupop with a single space for its label
	//then set that to the selectedItem, but also make it hidden within its menu
	//so that the menulist still has a selection and retains the same height
	//but the empty item doesn't show up in the list and can't be selected
	var menuitem = menulist.getElementsByTagName('menupopup').item(0)
		.appendChild(viewdoc.createElement('menuitem'));
	menuitem.setAttribute('value', '');
	menuitem.setAttribute('hidden', 'true');
	menuitem.setAttribute('label', '\u00a0');
	menulist.selectedItem = menuitem;

	
	//clear any existing data from the selectors and log information browsers
	this.clearBrowserDocument('dms-viewusedbrowser');
	this.clearBrowserDocument('dms-viewselectorsbrowser');
	this.clearBrowserDocument('dms-viewlogbrowser');

	//clear the view summary element
	this.updateViewSummary(null, null, null, null, null, null);


	//then only if we actually have data for any hosts
	//** is there a practical but more efficient way of getting this zero count
	if(DustMeSelectors_tools.count(DustMeSelectors_tools.getHostsIndex()) > 0)
	{
		//output the prompt message into each browser's content document
		//to tell the user [how] to [re-]select view data		
		var browsernames = ['selectors', 'used', 'log'];
		for(var i=0; i<3; i++)
		{
			var h2 = viewdoc.getElementById('dms-view' + browsernames[i] + 'browser')
						.contentDocument.querySelector('body').appendChild(viewdoc.createElement('h2'));
			h2.appendChild(viewdoc.createTextNode(DustMeSelectors_tools.bundle.getString('view.prompt')));
		}
	}
};




//view spider log for a stored host
DustMeSelectors_browser.viewSpiderLogForHost = function(host)
{
	//get a reference to the dialog document, and the content document in the dialog's browser
	var viewdoc = this.viewdialog.document;
	var doc = viewdoc.getElementById('dms-viewlogbrowser').contentDocument;

	//get the log object for the selected host
	var log = DustMeSelectors_tools.getDataObject(host, 'log', null);

	//if the log exists, update the view sumary element with its data
	if(log != null)
	{
		this.updateViewSummary(log.pages, log.files, log, 'log', log.summary, null);
	}
	//otherwise update it with the "not spidered" message
	else
	{
		this.updateViewSummary(0, 0, log, 'log', null, DustMeSelectors_tools.bundle.getString('spider.nolog'));

		//also show the "spider sitemap" prompt button
		//which otherwise won't get to show when tab-selecting and it's already compiled
		viewdoc.getElementById('dms-viewspiderbutton').setAttribute('hidden', 'false');
	}

	//if the browser document body already has any child nodes, we're done
	//unless the owning browser has the clearmark attribute
	if(doc.querySelector('body').hasChildNodes() 
		&& !viewdoc.getElementById('dms-viewlogbrowser')
			.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) { return; }

	//pass the references and the log object
	//to the populate log information method
	this.populateLogInformation(viewdoc, doc, log);
};


//begin to populate the selectors information iframe
DustMeSelectors_browser.populateLogInformation = function(viewdoc, doc, log)
{
	//get a reference to the document body
	var body = doc.querySelector('body');

	//then if it has any existing child nodes, do nothing
	//unless the owning browser has the clearmark attribute
	if(body.hasChildNodes() 
		&& !viewdoc.getElementById('dms-viewlogbrowser')
			.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) { return; }

	//otherwise show the progress dialog with it set to undetermined
	viewdoc.getElementById('dms-viewprogress').setAttribute('mode', 'undetermined');
	viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', false);

	//reset the abort button class and re-hide it
	var aborter2 = viewdoc.getElementById('dms-viewcleaning-abort2');
	aborter2.removeAttribute('class');
	aborter2.setAttribute('hidden', true);

	//wait a decent moment so the UI has a chance to update
	//then actually populate the log information view
	window.setTimeout(function()
	{
		DustMeSelectors_browser.doPopulateLogInformation(viewdoc, doc, body, log, window);

	}, 100);

};


//actually populate the log information iframe
DustMeSelectors_browser.doPopulateLogInformation = function(viewdoc, doc, body, log, xulwindow)
{
	//clear the browser document
	this.clearBrowserDocument('dms-viewlogbrowser');

	//enable the save and clear buttons
	viewdoc.getElementById('dms-viewactions-save').setAttribute('disabled', false);
	viewdoc.getElementById('dms-viewactions-clear').setAttribute('disabled', false);

	//if the log object is null then this site has not been spidered
	if(log == null)
	{
		//show the "spider sitemap" prompt button
		viewdoc.getElementById('dms-viewspiderbutton').setAttribute('hidden', 'false');
		
		//output the "not spidered" message to the browser document
		//nb. include a leadding and trailing line-break for formatting in clipboard data
		var h2 = body.appendChild(doc.createElement('h2'));
		h2.appendChild(doc.createTextNode('\n\r' + DustMeSelectors_tools.bundle.getString('spider.nolog') + '\n\r'));

		//hide the progress dialog
		viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
	}

	//otherwise we have log data
	else
	{
		//output the original sitemap URL plus incomplete note if applicable
		//including an isurl flag so the log context handler can idenitfy it
		//and adding tabindex so it's keyboard accessible (for keyboard triggered contextmenu)
		//nb. include a leading and trailing line-break for formatting in clipboard data
		//which is also why we use a tab rather than a space before the note
		var h2 = body.appendChild(doc.createElement('h2'));
		h2.isurl = true;
		h2.setAttribute('tabindex', '0');
		h2.appendChild(doc.createTextNode('\n\r' + log.baseurl));
		if(log.summary == 'incomplete')
		{
			var note = h2.appendChild(doc.createElement('small'));
			note.appendChild(doc.createTextNode('\t' + DustMeSelectors_tools.bundle.getString('spider.incomplete')));
		}
		h2.appendChild(doc.createTextNode('\n\r'));
					
		//if we have a non-null sourceurl property, then the sitemap was redirected
		//so output a "redirected from: " message inside the header
		if(typeof log.sourceurl != 'undefined' && log.sourceurl !== null)
		{
			var hq = h2.appendChild(doc.createElement('q'));
			hq.appendChild(doc.createTextNode(
				DustMeSelectors_tools.bundle
					.getString('spider.redirected').replace('%1', log.sourceurl)
					+ '\n\r'));
		}

		//output the log information, remembering to URI-decode each location 
		//before displaying it, because the log object keys are all encoded
		//and for items whose status isn't "notchecked", include an isurl flag 
		//on the span, so that the log context handler can idenitfy it
		//and adding tabindex so it's keyboard accessible (for keyboard triggered contextmenu)
		//nb. adding a leading tab before any message and a 
		//trailing space after the whole item for formatting in clipboard data
		var container = body.appendChild(doc.createElement('div'));
		container.setAttribute('class', 'spiderlog');
		var list = container.appendChild(doc.createElement('ol'));
		for(var i in log)
		{
			if(!log.hasOwnProperty(i) || (/^(pages|files|summary|baseurl|sourceurl)$/.test(i))) { continue; }
			var item = list.appendChild(doc.createElement('li'));
			item.setAttribute('class', log[i].status);
			var span = item.appendChild(doc.createElement('span'));
			span.appendChild(doc.createTextNode(decodeURIComponent(i)));
			if(log[i].status != 'notchecked')
			{
				span.isurl = true;
				span.setAttribute('tabindex', '0');
			}
			if(log[i].message)
			{
				var q = span.appendChild(doc.createElement('q'));
				q.appendChild(doc.createTextNode('\t' + log[i].message));
			}
			item.appendChild(doc.createTextNode('\n\r'));
		}

		//define a propery for storing whether the context menu was keyboard opened
		//which we'll use for preventing multiple actions when pressing enter on it
		//because that enter also fires on the underlying target
		this.keymenuopen = false;

		//if these listeners have not been defined
		if(this.hasevents.log == false)
		{
			this.hasevents.log = true;
	
			//bind a contextmenu listener to the document to handle the context menu
			doc.addEventListener('contextmenu', function(e)
			{
				DustMeSelectors_browser.logContextHandler(e, doc, viewdoc);
			
			}, false);
	
			//bind a keyup listener to handle the contextmenu keystroke
			doc.addEventListener('keyup', function(e)
			{
				DustMeSelectors_browser.logKeystrokeHandler(e, doc, viewdoc);
			
			}, false);
			
			//define a popuphidden event on the contexmenu 
			//to clear the keymenuopen flag if you press Escape
			viewdoc.getElementById('dms-viewlogcontext').addEventListener('popuphidden', function()
			{
				DustMeSelectors_browser.keymenuopen = false;
			
			}, false);
		}
	}

	//either way, now hide the progress dialog
	viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
};


//clear the log or selectors information page
DustMeSelectors_browser.clearBrowserDocument = function(id, clearmark)
{
	//double-check that the viewdialog hasn't closed, which it might have 
	//if this is called from a running APU when the dialog was closed in the meantime
	if(this.viewdialog && !this.viewdialog.closed)
	{
		//save a reference to the specified browser, and to its content document body
		var browser = this.viewdialog.document.getElementById(id);
		var body = browser.contentDocument.querySelector('body');
		
		//then if the clearmark flag is true, we don't need to actually clear the browser
		if(typeof clearmark !== 'undefined')
		{
			//just set a flag that says we can treat it as though it were clear
			//and this reduces workload in cases where all three browsers should be cleared at once
			browser.setAttributeNS('http://www.brothercake.com/dustmeselectors', 'dms:clearmark', 'true');		
			
			//but also un-display the body so that when switching 
			//between tabs when viewing a newly-selected host, 
			//you don't briefly see data from the previously selected host
			//(and being undisplayed might make it clear more quickly
			// because it has no rendering to do, though I haven't confirmed that)
			body.style.display = 'none';
		}
		
		//else proceed to clear the browser as normal
		else
		{
			//remove any clearmark attribute 
			browser.removeAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark');		
			
			//clear any existing content from the body
			//** this may trigger an unresponsive script warning if there's too much content 
			//** eg. while testing store.apple.com when we had ~20,000 unused selectors
			//** I tried a few different ways of doing this, but they weren't reliable 
			//** so I might abstract the whole "clear body" process to use an apu
			//** but even then, with that much data to view, even a simple group collapse takes
			//** excessive time (for firefox to redraw), and I don't know what I can do about that
			while(body.hasChildNodes())
			{
				body.removeChild(body.lastChild);
			}
			
			//then remove any residual cleaning class 
			//eg. if you re-select a host during a clean operation
			//but before the stylesheet has even finished loading
			body.className = '';
			
			//and re-display the body
			body.style.display = 'block';
		}
	}
};


//begin to populate the selectors information iframe
DustMeSelectors_browser.populateSelectorsInformation = function(viewdoc, doc, selectors, groupcount, datatype, updatestatus)
{
	//get a reference to the document body
	var body = doc.querySelector('body');

	//then if it has any existing child nodes, do nothing
	//unless the owning browser has the clearmark attribute
	if(body.hasChildNodes() 
		&& !viewdoc.getElementById('dms-view' + datatype + 'browser')
			.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) { return; }

	//otherwise show the progress dialog with it set to undetermined
	viewdoc.getElementById('dms-viewprogress').setAttribute('mode', 'undetermined');
	viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', false);

	//reset the abort button class and re-hide it
	var aborter2 = viewdoc.getElementById('dms-viewcleaning-abort2');
	aborter2.removeAttribute('class');
	aborter2.setAttribute('hidden', true);

	//wait a decent moment so the UI has a chance to update
	//then actually populate the selectors information view
	window.setTimeout(function()
	{
		DustMeSelectors_browser.doPopulateSelectorsInformation(viewdoc, doc, body, selectors, groupcount, datatype, updatestatus);

	}, 100);
};


//actually populate the selectors information iframe
DustMeSelectors_browser.doPopulateSelectorsInformation = function(viewdoc, doc, body, selectors, groupcount, datatype, updatestatus)
{
	//clear the browser document
	this.clearBrowserDocument('dms-view' + datatype + 'browser');

	//enable the save and clear buttons
	viewdoc.getElementById('dms-viewactions-save').setAttribute('disabled', false);
	viewdoc.getElementById('dms-viewactions-clear').setAttribute('disabled', false);

	//if we have no groups then there are no stylesheets
	if(groupcount == 0)
	{
		//create the output heading 
		var h2 = body.appendChild(doc.createElement('h2'));

		//if we have a dataerror saved, output that message, then delete the error
		//nb. include a leading and trailing line-break for formatting in clipboard data
		//eg. if you "select all" and then copy and paste the data into a text file
		if(typeof DustMeSelectors_browser.dataerror != 'undefined')
		{
			h2.appendChild(doc.createTextNode('\n\r' + DustMeSelectors_browser.dataerror + '\n\r'));
			delete DustMeSelectors_browser.dataerror;
		}

		//otherwise output the "no stylesheets" message
		else
		{
			h2.appendChild(doc.createTextNode('\n\r' + DustMeSelectors_tools.bundle.getString('view.none') + '\n\r'));
		}
	}

	//otherwise we have selectors data
	else
	{
		//get the pointer fragment we used for storing stylesheet owner information in its group URL
		//nb. we don't need to re-parse in this instance because the pointer can only exist 
		//in a dataset if it's already been through the process that parses it in the first place
		//and if someone edits it between then and now, well that's their own look out!
		DustMeSelectors.sheetpointer = DustMeSelectors_preferences.getPreference('string', 'sheetpointer');
										
		//check the preferences for selector filter patterns
		//to save the returned dictionary of corresponding RegExp objects
		//or null each one for which the preference is not enabled
		//setting defaults for each preference that's not defined along the way
		DustMeSelectors.selectorfilters = DustMeSelectors_preferences.getSelectorFilters();
	
		//count the number of style block rules we find on each page
		//so we can display the number as part of the group URL
		var styleblocks = {};

		//output the selectors information
		for(var i in selectors)
		{
			if(!selectors.hasOwnProperty(i)) { continue; }

			//decode the stylesheet URL to use as the group header
			//and split it by any owner pointer hash
			//nb. any other hash it contained will have been removed before saving
			var groupurl = decodeURIComponent(i).split('#' + DustMeSelectors.sheetpointer);
			
			//create a new styleblocks counter for this groupurl if we don't already have one
			if(typeof styleblocks[encodeURIComponent(groupurl[0])] == 'undefined')
			{
				styleblocks[encodeURIComponent(groupurl[0])] = 0;
			}
			
			//then if it contains the pointer hash for a style element
			//add a human-friendly number in brackets after the URL
			//incrementing the styleblocks counter each time we use it
			//otherwise we only want the URL, which will be the only part
			//** until we implement owner information for all stylesheets
			//** but we might not use a pointer hash for that anyway
			//** since it would be quite a pain to allow for everywhere
			//nb. use non-breaking spaces before the number so that long URLs
			//don't wrap in such a way that the number is on its own line
			groupurl = groupurl[0] 
						+ (!groupurl[1] || groupurl[1].indexOf('(style[') < 0 
							? '' 
							: ('\u00a0\u00a0(' + (++styleblocks[encodeURIComponent(groupurl[0])]) + ')'));

			//now create the URL header with tabindex so it's keyboard accessible
			//nb. include a leading and trailing line-break for formatting in clipboard data
			//nnb. I didn't want an extra space after each group, because 
			//that would change the structure of nodes at the group level
			//and break a whole bunch of child and sibling references we use
			h2 = body.appendChild(doc.createElement('h2'));
			h2.appendChild(doc.createTextNode('\n\r' + groupurl + '\n\r'));
			h2.setAttribute('tabindex', '0');
			
			//create the group container
			var group = body.appendChild(doc.createElement('div'));

			//populate the group
			this.populateSelectorsGroup(doc, selectors, group, i, datatype);
		}
		
		
		//pass the selectors object to the view-summary-totals method, to get an object of totals
		var totals = DustMeSelectors_tools.getViewSummaryTotals(selectors);

		//then update the summary description element
		this.updateViewSummary(totals.rules, totals.sheets, null, datatype, null, null);

		//define the lastselection array which will store
		//object references to the items that are selected
		//and a selectiongroup property that store the group containing the selections
		//which is used to prevent selections across groups
		this.lastselection = [];
		this.selectiongroup = null;

		//define a property for storing the currently focused element
		//which we'll use for manipulating focus when deleting items with the keyboard
		this.hasfocus = null;

		//define a propery for storing whether the context menu was keyboard opened
		//which we'll use for preventing multiple actions when pressing enter on it
		//because that enter also fires on the underlying target
		this.keymenuopen = false;

		/** NWAM (1) **/
		
		//if these listeners have not been defined
		if(this.hasevents[datatype] == false)
		{
			this.hasevents[datatype] = true;

			//bind a mousedown handler to the document to handle click selection
			doc.addEventListener('mousedown', function(e)
			{
				DustMeSelectors_browser.viewSelectionHandler(e, doc, viewdoc, datatype);
			
			}, false);

			/** NWAM (2) **/

			//bind a contextmenu listener to the document to handle the context menu
			doc.addEventListener('contextmenu', function(e)
			{
				DustMeSelectors_browser.viewContextHandler(e, doc, viewdoc, datatype);
			
			}, false);

			//bind a keyup listener to handle the various keystrokes
			doc.addEventListener('keyup', function(e)
			{
				DustMeSelectors_browser.viewSelectionHandler(e, doc, viewdoc, datatype);
			
			}, false);
			
			//define a popuphidden event on the contexmenu 
			//to clear the keymenuopen flag if you press Escape
			viewdoc.getElementById('dms-view' + datatype + 'context').addEventListener('popuphidden', function()
			{
				DustMeSelectors_browser.keymenuopen = false;
			
			}, false);
		}
	}

	//then either way, re-hide the progress dialog
	viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
};

//populate a single group within the view document
DustMeSelectors_browser.populateSelectorsGroup = function(doc, selectors, group, i, datatype)
{
	//count the data in this group, and also maintain 
	//a separate count that doesn't include malformed rules
	var count = 0;

	//a group containing 0 or more selectors
	if(typeof selectors[i] == 'object')
	{
		for(var j in selectors[i])
		{
			if(!selectors[i].hasOwnProperty(j)) { continue; }
			count++;
		}
		if(count == 0)
		{
			group.className = 'group ' + (datatype == 'used' ? 'warning' : 'okay');
			var h3 = group.appendChild(doc.createElement('h3'));
			h3.className = datatype == 'used' ? 'warning' : 'okay';
			h3.appendChild(doc.createTextNode(DustMeSelectors_tools.bundle
				.getString('view.' + (datatype == 'used' ? 'noused' : 'okay')) + '\n\r'));
		}
		else
		{
			group.className = 'group ' + (datatype == 'used' ? 'okay' : 'warning');
			h3 = group.appendChild(doc.createElement('h3'));
			h3.className = datatype == 'used' ? 'okay' : 'warning';
			h3.setAttribute('tabindex', '0');
			h3.appendChild(doc.createTextNode(DustMeSelectors_tools.bundle
				.getString('view.' + (datatype == 'used' ? 'used' : 'warning'))
				.replace('%1', count)
				.replace('%P1', (count == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
				+ '\n\r'));
			var list = group.appendChild(doc.createElement('ul'));
			for(var j in selectors[i])
			{
				if(!selectors[i].hasOwnProperty(j)) { continue; }

				var item = list.appendChild(doc.createElement('li'));
				item.setAttribute('tabindex', '0');
				var thisselector = selectors[i][j].split('{');
				
				//make the selector a <q>, which is relevant semantics I think
				//(ie. it's a short textual quote from a stylehseet!)
				//but particularly useful here because we can use the cite attribute 
				//to store the URI of the relating stylesheet (its index in the selectors object)
				//also use the class attribute to store its index in the group object
				//** might change this to <code data-uri="..." data-index="...">
				var q = item.appendChild(doc.createElement('q'));
				q.setAttribute('cite', i);
				q.className = 'j' + j;
				
				//now iterate through the selectorfilters, and for each one that's in use
				//(except for "ignoreelements"), match any instances of that filter 
				//within this selector, and wrap syntax highlighting elements around them
				var selectordata = null, matches = null;
				for(var key in DustMeSelectors.selectorfilters)
				{
					if(DustMeSelectors.selectorfilters.hasOwnProperty(key))
					{
						if(key != 'ignoreelements' && DustMeSelectors.selectorfilters[key] !== null)
						{
							if(selectordata === null)
							{
								selectordata = thisselector[0];
								
								//nb. encode any existing special characters in this selector
								//because we have to pass it through node creation in XHTML 
								//and that would throw an error over eg [class^="<!"]
								//(which isn't a problem with createTextNode, since in that context 
								// it's non-ambiguous and therefore intrepreted as plain text)
								if(/[&<>]/.test(selectordata))
								{
									selectordata = selectordata.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
								}
							}
							if((matches = thisselector[0].match(DustMeSelectors.selectorfilters[key])) !== null)
							{
								for(var m = 0; m < matches.length; m ++)
								{
									selectordata = selectordata.replace(matches[m], '<em class="' + key + '">' + matches[m] + '</em>');
								}
							}
						}						
					}
				}
				
				//then if we defined any highlighting data, the selectordata var 
				//will contain that string plus any internal markup, so we 
				//write it to a virtual element to convert it to a dom 
				//(which is ten times faster than using DOMParser)
				//then append the resulting subtree to the selector <q>
				if(selectordata !== null)
				{
					//but use exception handling just in case this still throws a parsing exception 
					//over something I haven't consideered (though I can't think what!)
					try
					{
						var docfrag = doc.createElement('div');
						//NOTE FOR REVIEWERS: this is text-DOM conversion on a non-appended node
						docfrag.innerHTML = selectordata;
						while(docfrag.hasChildNodes())
						{
							q.appendChild(docfrag.childNodes[0]);
						}
						docfrag = null;
					}
					//and if we catch an exception, output the selector in plain text
					//nb. this will still show a console error, but it will work
					catch(ex)
					{
						while(q.hasChildNodes())
						{
							q.removeChild(q.lastChild);
						}
						q.appendChild(document.createTextNode(thisselector[0]));
					}
				}
				//otherwise just append the selector text as normal
				else
				{
					q.appendChild(document.createTextNode(thisselector[0]));
				}
				
				//add the "unrecognised" or "malformed" class if this selector is
				//(to the q so it doens't interfere with li.selected)
				if(thisselector[0].indexOf(DustMeSelectors_tools.bundle.getString('error.unrecognised')) == 0)
				{
					q.className += ' unrecognised';
				}
				if(thisselector[0].indexOf(DustMeSelectors_tools.bundle.getString('error.malformed')) == 0)
				{
					q.className += ' malformed';
				}
				
				//add a line number <cite> if we have a value
				//(which we always will have except for malformed rules)
				//nb. adding a leading tab before any line-number and a 
				//trailing space after the whole item for formatting in clipboard data
				if(thisselector[1])
				{
					var line = item.appendChild(doc.createElement('cite'));
					line.appendChild(doc.createTextNode('\t' + DustMeSelectors_tools.bundle.getString('view.line')
						.replace('%1', parseInt(thisselector[1], 10))
						));
				}
				item.appendChild(doc.createTextNode('\n\r'));
			}

			//bind the toggle class name for indicator
			h3.className += ' toggle';

			//add a "clean" button inside the group URL header
			//including adding the "cleanable" class to the URL header itself
			//saving a circular reference from the button back to the header
			//nb. this is only shown in populated groups of "unused" rules
			//and only if it's not an internal style block, which we can't load
			//via ajax and therefore can't clean using the current implementation
			if(datatype == 'selectors' && decodeURIComponent(i).indexOf('#' + DustMeSelectors.sheetpointer + '(style[') < 0)
			{
				group.previousSibling.className = 'cleanable';
				var button = group.previousSibling.appendChild(doc.createElement('button'));
				group.previousSibling.button = button;
				button.setAttribute('type', 'button');
				button.appendChild(doc.createTextNode(DustMeSelectors_tools.bundle.getString('view.cleaning.button')));
				
				button.addEventListener('click', function(e)
				{
					DustMeSelectors_browser.showStylesheetCleaner(button.parentNode);
				
				}, false);
				
				//we also have to bind this mousedown to stop focus bubbling up to the H2
				//should be able to do that with stopPropagation, but that doesn't work in this case
				//even though the keyboard handler's stopPropagation does do exactly that 
				//if we don't do this, then if you press the button with the mouse, and that 
				//triggers a dialog, and then you press Enter or Space to accept the dialog 
				//the H2's keydown event is triggered and the "mark all" contextmenu appears
				//however doing this also means that the button's active effect doesn't happen
				//so we compensate by setting focus, and then at least you get the focus effect
				//(in fact the overal result is exactly the same as keyboard indication)
				button.addEventListener('mousedown', function(e)
				{
					button.focus();
					e.preventDefault();
				
				}, false);
				
			}
			
			//if the precollapse preference is enabled, immediately 
			//un-display the list and update the heading class to match
			if(DustMeSelectors_preferences.getPreference('boolean', 'precollapse') === true)
			{
				list.style.display = 'none';
				h3.className += ' closed';
			}
		}
	}
	//an error message
	else
	{
		group.className += ' error';
		h3 = group.appendChild(doc.createElement('h3'));
		h3.className = 'error';
		h3.appendChild(doc.createTextNode(selectors[i] + '\n\r'));
	}
};


//show the cleaning interface for a stylesheet, 
//identified by URL and by the list of its unused selectors
DustMeSelectors_browser.showStylesheetCleaner = function(groupheading)
{
	//save a reference to the viewdialog document
	var viewdoc = this.viewdialog.document;
	
	//get the stylesheet URL from the text in the group heading
	//crucially trimming the value to remove the leading and trailing whitespace 
	var url = groupheading.firstChild.nodeValue.replace(/^\s+|\s+$/g, '');
	
	//get the latest selectors data for this stylesheet, 
	//nb. we can't just pass the selectors object that the button handler has
	//because you might have marked selectors used since the view was compiled
	var selectors = DustMeSelectors_tools.getDataObject(
		viewdoc.getElementById('dms-hostsindexmenu').selectedItem.getAttribute('value'), 
		'selectors', {})[encodeURIComponent(url)];

	//now to make this functionality work I've had to update the data format 
	//to record not just the line number but also the selector position index
	//so before going any further, start to iterate through the selectors object 
	//and test the first value we find, to make sure it has the data we need
	//nb. of course we could have checked this when compiling the output 
	//and just not shown the button, but this way the user gets indication 
	//that this function exists, and then information on how to get to use it 
	for(var i in selectors)
	{
		if(selectors.hasOwnProperty(i))
		{
			//don't test malformed rules!
			if(selectors[i].indexOf(DustMeSelectors_tools.bundle.getString('error.malformed')) >= 0) { continue; }
			
			//then if the selector doesn't have both a line number and position index
			var tmp = selectors[i].split('{');
			if(tmp.length < 2 || tmp[1].split('.').length < 2)
			{
				//show the info dialog that describes the problem and solution
				//(which is to trash the data and re-spider/scan the site)
				//nb. this dialog has onunload because a reset isn't necessary
				this.viewdialog.openDialog('chrome://dustmeselectors/content/cleaningdata.xul',
					'errdialog', 'chrome,centerscreen,modal,resizable=no');

				//then abandon the process				
				return;
			}
			
			//else if we do have the data we need, we can stop checking now
			break;
		}
	}
	

	//show the progress dialog with it set to undetermined
	viewdoc.getElementById('dms-viewprogress').setAttribute('mode', 'undetermined');
	viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', false);
	
	//remove any warning icon that might be still present from a previous clean
	//and reset any removal timer that might still be running
	var warningicon = viewdoc.getElementById('dms-viewcleaning-warning');
	warningicon.setAttribute('hidden', true);
	if(warningicon.__hider){ clearTimeout(warningicon.__hider); }

	//remove any info icon that might be present from a previous export or save
	//and reset any removal timer that might still be running
	var infoicon = viewdoc.getElementById('dms-viewinfo-saved');
	infoicon.setAttribute('hidden', true);
	if(infoicon.__hider){ clearTimeout(infoicon.__hider); }

	//replace the cleaning abort button with a deep clone of itself
	//(so we can remove any existing command listener even if it's anonymous and unassigned)
	var aborter2 = viewdoc.getElementById('dms-viewcleaning-abort2');
	aborter2.parentNode.replaceChild(aborter2.cloneNode(true), aborter2);

	//then re-get the reference and show the button, and set its class to connecting
	var aborter2 = viewdoc.getElementById('dms-viewcleaning-abort2');
	aborter2.setAttribute('hidden', false);
	aborter2.setAttribute('class', 'connecting');
	

	//save shortcuts to the viewselectors browser,
	//and to its content document and document body
	var browser = viewdoc.getElementById('dms-viewselectorsbrowser');
	var doc = browser.contentDocument;
	var body = doc.querySelector('body');
	
	//set the cleaning class on the body, so that the view handlers 
	//know to temporarily ignore the selection and contextmenu events
	body.className = 'cleaning';

	//then replace the group heading with a new that has the stylesheet loading message, 
	//including its own identifying class so event handlers can recognise it
	//plus an additional status class so it shows the connecting icon
	//nb. we replace this rather than updating the text in the existing heading
	//so that we can use the loss of its reference to detect abandonment 
	//but save the original heading as a property of the new one, so we can 
	//restore it in at the end, or for reset instead of having to re-generate the view
	//nb. since the triggering button is no longer displayed, the focus will be reset 
	//to the top of the browser document, then once the process is finished, 
	//pressing Tab will send focus back to the re-instated group URL heading 
	//I did consider moving focus to the save button, but leaving it here means that
	//at the end, you'll be able to scroll the codeview straight away by pressing down-arrow
	var h2 = doc.createElement('h2');
	h2.appendChild(document.createTextNode(DustMeSelectors_tools.bundle.getString('view.cleaning.loading')));
	h2.className = 'cleaning';
	h2.groupheading = groupheading.parentNode.replaceChild(h2, groupheading);
	
	
	//***DEV LATENCY
	//setTimeout(function(){ 
	
	
	//***DEV (guest break the URL or content-type)
	//url = 'http://localhost/home';
	//url = 'http://localhost/fail';
	//url = 'http://localhost/home?type=fail';

	
	//create a new request object for loading the specified stylesheet
	var http = new XMLHttpRequest();

	//when the request completes
	http.onreadystatechange = function()
	{
		//when the headers have been received
		if(http.readyState == 2)
		{
			//re-show the progressmeter just in case 
			//you select a different tab while it's connection
			viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', false);
			
			//change the abort button status class to loading
			//and also re-show it likewise
			aborter2.setAttribute('hidden', false);
			aborter2.setAttribute('class', 'loading');
		}

		//when the request completes
		if(http.readyState == 4)
		{
			//***DEV LATENCY
			//setTimeout(function(){ 
			
			
			//do this on a try catch to handle errors
			//in case we get NS_ERROR_NOT_AVAILABLE
			try
			{
				//if the request completed successfully, or has zero status
				//(which might be a failure, or it might just be a file:// address)
				if(/^(0|200|304)$/.test(http.status.toString()))
				{
					//so if we have zero status we need to find out wtf
					if(http.status == 0)
					{
						//so if the responseText is empty then it's a connection error
						if(!http.responseText)
						{
							//if the status heading is still there and the viewdialog hasn't closed
							//and the viewselectors browser doesn't have the clearmark attribute
							if(h2.parentNode 
								&& (DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
								&& !browser.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) 
							{ 
								//restore the original heading 
								body.replaceChild(h2.groupheading, h2);
								
								//re-hide the progress dialog
								viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
							
								//reset the abort button class and re-hide it
								aborter2.removeAttribute('class');
								aborter2.setAttribute('hidden', true);
		
								//report the connection error
								//NOTE FOR REVIEWERS: the query value will never contain a remote URI
								DustMeSelectors_browser.viewdialog.openDialog('chrome://dustmeselectors/content/cleaningerror.xul?text='
									+ encodeURI(DustMeSelectors_tools.bundle.getString('error.cleaning.xhr')
													.replace('%1', DustMeSelectors_tools.bundle.getString('error.noconnect'))),
									'errdialog', 'chrome,centerscreen,modal,resizable=no');
							}
						}
						
						//else it must be a local file, and for that we can't check the content-type
						//because local files have no headers, however being a local file it can't 
						//have been server-preprocessed, so let's just assume it is a stylesheet 
						//(as it's not very likely to be in the document stylesheets connection if not,
						// and if it still turns out not to be a stylesheet, that's the user's problem!)
						//* we could check it using the filesystem, but it's probably not worth it
					}
					
					//else if the status was okay or not-modified, check the mime-type 
					//(parsed of any character encoding) and if it's not CSS, then we can't proceed 
					//nb. we need to do this in case the site is doing some wackass bullshit
					//like checking referer info so its stylesheets can only be loaded as includes
					//(ie. an xhr request has no such referer so we get a redirect instead)
					//however it might also catch programatically generated stylesheets where the 
					//author is not sending the correct mime-type, but we can't really allow for that
					//without doing more complex parsing on the content to see if it has the syntax of CSS
					//(and iirc stylesheets like that won't appear in firefox's CSS DOM in the first place)
					else if(!/^\s*text\/css/i.test(http.getResponseHeader('Content-Type')) && url.indexOf('file:') !== 0)
					{
						//if the status heading is still there and the viewdialog hasn't closed
						//and the viewselectors browser doesn't have the clearmark attribute
						//nb. we have to check in case another host was selected in the meantime
						//in which case the status content will have been replaced by another data view
						//the h2 reference itself will still exist, but it will no longer refer to 
						//a node within this (or any) document, hence it won't have a parent node
						//or we might have just done a clearmark reset in which case it will be there
						//but we don't want to proceed because the browser is marked as clear
						//nb. and if that's the case there's no point reporting the error either
						if(h2.parentNode 
							&& (DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
							&& !browser.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) 
						{ 
							//restore the original heading 
							body.replaceChild(h2.groupheading, h2);
						
							//re-hide the progress dialog
							viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
						
							//reset the abort button class and re-hide it
							aborter2.removeAttribute('class');
							aborter2.setAttribute('hidden', true);
	
							//then report the processing error, the dialog for which has an onunload method
							//that hides the stylesheet cleaning interface and resets back to the unused selectors view
							//NOTE FOR REVIEWERS: the query value will never contain a remote URI
							DustMeSelectors_browser.viewdialog.openDialog('chrome://dustmeselectors/content/cleaningerror.xul?text='
								+ encodeURI(DustMeSelectors_tools.bundle.getString('error.cleaning.type')),
								'errdialog', 'chrome,centerscreen,modal,resizable=no');
						}
						
						//then we're done here
						return;
					}
					
					//if the status heading is still there and the viewdialog hasn't closed
					//and the viewselectors browser doesn't have the clearmark attribute
					if(h2.parentNode 
						&& (DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
						&& !browser.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) 
					{
						
						//reset the abort button class and re-hide it
						//nb. this will then be re-shown and set to processing
						//by the cleaning process, if it gets to run
						aborter2.removeAttribute('class');
						aborter2.setAttribute('hidden', true);

						//change the heading text to the stylesheet processing message						
						h2.firstChild.nodeValue = DustMeSelectors_tools.bundle.getString('view.cleaning.processing');

						//get the used selectors data for this stylesheet, 
						//because the cleaner needs both for comparison
						var used = DustMeSelectors_tools.getDataObject(
							viewdoc.getElementById('dms-hostsindexmenu').selectedItem.getAttribute('value'), 
							'used', 
							{}
							)[encodeURIComponent(url)];
						
						//now pass all the relevant data to the dust-me selector marking function 
						//which passes back the same text but with markers around unused selectors and rules
						DustMeSelectors.addSelectorMarks(url, http.responseText, selectors, used, viewdoc, doc, h2, 
						
						//if that completes successfully
						function(csstext, found)
						{
							
							//if the status heading is still there and the viewdialog hasn't closed
							//and the viewselectors browser doesn't have the clearmark attribute
							if(h2.parentNode 
								&& (DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
								&& !browser.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) 
							{
								//remove it but save the reference
								h2 = body.removeChild(h2);
								
								//clear the browser document 
								DustMeSelectors_browser.clearBrowserDocument('dms-viewselectorsbrowser');
								
								//then restore the cleaning class
								body.className = 'cleaning';
								
								//then restore the original group heading (which still won't 
								//show its button while the body "cleaning" class is present)
								body.appendChild(h2.groupheading);
							
								//now create a PRE element after it, in which we'll compile a code view
								//of the cleaned stylesheet, with highlighting for unused selectors and rules 
								var codeview = body.appendChild(doc.createElement('pre'));
								

								//make a copy of the csstext and parse any HTML special characters in that
								//converting them to HTML entities ready for output in the browser document
								//nb. we have to do this to prevent output errors, eg. in case of <> symbols 
								//any existing entities (eg. in comments) will also be encoded, as eg. "&amp;amp;"
								//which then appear in the output document exactly as they do in the stylesheet
								var htmltext = csstext.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

								//then convert the selector and rule marks to <mark> elements 
								//using a data-type attribute to differentiate them 
								//nb. the marks are all designated non-characters:
								//		selector start		fdd0		selector end		fdd1
								//		rule start			fdd2		rule end			fdd3
								//		temporary start		fdd4		temporary end		fdd6
								//nb. differentiation will be helpful when it comes to 
								//commenting-out marked selectors, because it's only with rules that 
								//we need to consider that the mark might already contain a comment
								//(ie. if it's left untreated it will prematurely closed our comment)
								//however using the same element for all will equally be helpful
								//when it comes to handling selection events on the codeview
								//and for detecting where the marks are when generating line numbers
								htmltext = htmltext.replace(/[\ufdd0]/g, '<mark data-type="selector">');
								htmltext = htmltext.replace(/[\ufdd1]/g, '</mark>');
								htmltext = htmltext.replace(/[\ufdd2]/g, '<mark data-type="rule">');
								htmltext = htmltext.replace(/[\ufdd3]/g, '</mark>');

								//then parse any stylesheet comments to add syntax wrappers
								//and then try to output the html text using the append-html trick
								//so we can compile it as a string but append it as proper nodes
								//(which is significantly faster than the XMLSerializer class)
								//however just in case that throws an exception, it will almost 
								//certainly be because there's something in the stylesheet that 
								//isn't accounted for, which has given rise to illegal nesting 
								//between the highlighting <mark>s and the comment syntax <i>s
								//so if that happens, try again without the comment syntax wrappers
								//** this occurrence still throws an error to the console, even 
								//** though we catch the failure and the alternative output works!
								//** still, there are no known situations where this could now happen
								//** and even if it does, at the least the output still works
								var docfrag = doc.createElement('div');
								try
								{
									//NOTE FOR REVIEWERS: this is text-DOM conversion on a non-appended node
									docfrag.innerHTML = htmltext.replace(/(\/\*([^*]|(\*+([^*\/])))*\*+\/)/gm, '<i>$1</i>');
								}
								catch(ex)
								{
									//NOTE FOR REVIEWERS: this is text-DOM conversion on a non-appended node
									docfrag.innerHTML = htmltext;
								}
								finally
								{
									while(docfrag.hasChildNodes())
									{
										codeview.appendChild(docfrag.childNodes[0]);
									}
								}
								
								//then create a gutter element to add the line numbering
								//(starting from 1 and for as many lines as there are)
								//nb. using the htmltext so we can detect where the marks are
								var gutter = codeview.appendChild(doc.createElement('div'));
								for(var lines = htmltext.split(/^/m), i = 0; i < lines.length; i ++)
								{
									var number = gutter.appendChild(doc.createElement('span'));
									if(/<mark/i.test(lines[i]))
									{
										number.className = 'mark';
									}
									number.appendChild(doc.createTextNode(i + 1));
								}
								
								//the gutter padding makes it the same size as the codeview 
								//except for when the codeview is shorter than the browser
								//so in that add the "short" class to add some special tweaks
								if(codeview.offsetHeight < doc.documentElement.offsetHeight)
								{
									codeview.className = 'short';
								}
								
								//now scroll the browser back to the top
								doc.documentElement.scrollTop = 0;
								
								
								//finally create a temporary global cleaningdata function 
								//with the original csstext and the found information
								//plus the original URL and a reference to the codeview element
								DustMeSelectors_browser.cleaningdata = 
								{ 
									csstext 	: csstext, 
									found 		: found,
									url			: url,
									codeview 	: codeview
								};
								
								//then update the view cleaning summary and show the cleaning controls
								DustMeSelectors_browser.updateCleaningSummary();
							}

						},
						
						//but if it fails it will return an error or warning message
						function(errorcode, msgtype)
						{
							//if the status heading is still there and the viewdialog hasn't closed
							//and the viewselectors browser doesn't have the clearmark attribute
							if(h2.parentNode 
								&& (DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
								&& !browser.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) 
							{ 
								//restore the original heading 
								body.replaceChild(h2.groupheading, h2);
								
								//re-hide the progress dialog
								viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
								
								//reset the abort button class and re-hide it
								aborter2.removeAttribute('class');
								aborter2.setAttribute('hidden', true);
		
								//if the errorcode is "minified" then show the cleaningminified dialog
								//which is hard-coded and formatted for this one specific situation
								if(errorcode == 'minified')
								{
									DustMeSelectors_browser.viewdialog.openDialog('chrome://dustmeselectors/content/cleaningminified.xul',
										'errdialog', 'chrome,centerscreen,modal,resizable=no');

									//also remove the cleaning button and class from the original group heading
									//since pressing it again would just produce the same error
									//(although we won't make that a permanent filter, since the stylesheet 
									// might get edited and we don't want it permanently locked-out)
									//nb. we must add yhis after showing the dialog otherwise it won't appear
									h2.groupheading.removeChild(h2.groupheading.button);
									h2.groupheading.className = '';
								}
								
								//otherwise the errorcode refers to a properties string
								//so report that corresponding error or warning 
								//according to message type (deafulting to "error")
								//** this is currently unused, but keep it anyway
								else
								{
									//NOTE FOR REVIEWERS: the query value will never contain a remote URI
									DustMeSelectors_browser.viewdialog.openDialog('chrome://dustmeselectors/content/cleaning' + (msgtype || 'error') + '.xul?text='
										+ encodeURI(DustMeSelectors_tools.bundle.getString(errorcode)),
										'errdialog', 'chrome,centerscreen,modal,resizable=no');
								}
							}
						},
						
						//or it's prematurely aborted it will just stop
						function()
						{
							//if the status heading is still there and the viewdialog hasn't closed
							//and the viewselectors browser doesn't have the clearmark attribute
							if(h2.parentNode 
								&& (DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
								&& !browser.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) 
							{ 
								//restore the original heading 
								body.replaceChild(h2.groupheading, h2);
									
								//remove the body cleaning class so the view events work again
								//nb. we don't need to worry about restoring the original h2 
								//because any action that causes this abort will ultimately 
								//lead to the used selectors view being re-generated anyway
								body.className = '';
								
								//re-hide the progress dialog
								viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
								
								//reset the abort button class and re-hide it
								aborter2.removeAttribute('class');
								aborter2.setAttribute('hidden', true);
		
								//show the viewcleaning warning icon, which has a tooltip with an 
								//onpopuphidden event, so it re-hides the icon after you've seen the tooltip :-)
								//however the user might have seen it before, so hide it anyway after 7 seconds
								//but first clear any instance of the timer that might still be running
								var warningicon = viewdoc.getElementById('dms-viewcleaning-warning');
								warningicon.setAttribute('hidden', false);
								if(warningicon.__hider){ clearTimeout(warningicon.__hider); }
								warningicon.__hider = setTimeout(function()
								{
									if(warningicon)
									{
										warningicon.setAttribute('hidden', true);
									}
								}, 7000);
							}
						});
	
					}
				}
	
				//or if we failed to load the stylesheet
				else
				{
					//if the status heading is still there and the viewdialog hasn't closed
					//and the viewselectors browser doesn't have the clearmark attribute
					if(h2.parentNode 
						&& (DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
						&& !browser.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) 
					{ 
						//restore the original heading 
						body.replaceChild(h2.groupheading, h2);
						
						//re-hide the progress dialog
						viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
			
						//reset the abort button class and re-hide it
						aborter2.removeAttribute('class');
						aborter2.setAttribute('hidden', true);

						//report the loading error
						//NOTE FOR REVIEWERS: the query value will never contain a remote URI
						DustMeSelectors_browser.viewdialog.openDialog('chrome://dustmeselectors/content/cleaningerror.xul?text='
							+ encodeURI(DustMeSelectors_tools.bundle.getString('error.cleaning.xhr')
											.replace('%1', http.status + ' ' + http.statusText)),
							'errdialog', 'chrome,centerscreen,modal,resizable=no');
					}
				}
			}
			
			//then if we catch an exception
			catch(ex)
			{
				//if the status heading is still there and the viewdialog hasn't closed
				//and the viewselectors browser doesn't have the clearmark attribute
				if(h2.parentNode 
					&& (DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
					&& !browser.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) 
				{ 
					//restore the original heading 
					body.replaceChild(h2.groupheading, h2);
					
					//re-hide the progress dialog
					viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
				
					//reset the abort button class and re-hide it
					aborter2.removeAttribute('class');
					aborter2.setAttribute('hidden', true);

					//report the connection error
					//NOTE FOR REVIEWERS: the query value will never contain a remote URI
					DustMeSelectors_browser.viewdialog.openDialog('chrome://dustmeselectors/content/cleaningerror.xul?text='
						+ encodeURI(DustMeSelectors_tools.bundle.getString('error.cleaning.xhr')
										.replace('%1', DustMeSelectors_tools.bundle.getString('error.noload'))),
						'errdialog', 'chrome,centerscreen,modal,resizable=no');
				}
			}

			//***DEV LATENCY
			//}, Math.random() * 3000); 
		}
	};
	
	//now try to open and send the stylesheet url request 
	//nb. don't include a nocache query as we want it to come from cache if it can
	//so that its content is the same as was used when scanning the site 
	//(ie. so if it's been updated you have to re-scan the site first)
	try
	{
		http.open('GET', url, true);
		http.send(null);
	}
	
	//or if we catch an exception (eg. some kinds of network problem)
	catch(ex)
	{
		//if the status heading is still there and the viewdialog hasn't closed
		//and the viewselectors browser doesn't have the clearmark attribute
		if(h2.parentNode 
			&& (DustMeSelectors_browser.viewdialog && !DustMeSelectors_browser.viewdialog.closed)
			&& !browser.hasAttributeNS('http://www.brothercake.com/dustmeselectors', 'clearmark')) 
		{ 
			//restore the original heading 
			body.replaceChild(h2.groupheading, h2);
					
			//reset the abort button class and re-hide it
			aborter2.removeAttribute('class');
			aborter2.setAttribute('hidden', true);

			//report the connection error
			//NOTE FOR REVIEWERS: the query value will never contain a remote URI
			DustMeSelectors_browser.viewdialog.openDialog('chrome://dustmeselectors/content/cleaningerror.xul?text='
				+ encodeURI(DustMeSelectors_tools.bundle.getString('error.cleaning.xhr')
								.replace('%1', DustMeSelectors_tools.bundle.getString('error.noconnect'))),
				'errdialog', 'chrome,centerscreen,modal,resizable=no');
		}
	}

	
	//***DEV LATENCY
	//}, Math.random() * 3000); 
};


//update the view cleaning summary and show the cleaning controls
DustMeSelectors_browser.updateCleaningSummary = function()
{
	//just in case we don't have cleaning data, just exit
	//nb. although if the buttons are visible then we always will
	//but this condition is jic an error causes them to appear at the wrong time
	if(!DustMeSelectors_browser.cleaningdata) { return; }

	//save a reference to the viewdialog document 
	var viewdoc = DustMeSelectors_browser.viewdialog.document;

	//get the viewfooter summary description element and clear any existing content
	var description = viewdoc.getElementById('dms-viewsummary');
	while(description.hasChildNodes())
	{
		description.removeChild(description.firstChild);
	}

	//append a new summary with the found selectors and rules information
	//including the "missed" language only if we missed any
	var found = DustMeSelectors_browser.cleaningdata.found;
	description.appendChild(
		viewdoc.createTextNode(DustMeSelectors_tools.bundle
			.getString('view.cleaning.summary')
			.replace('%1', (found.selectors == 0 ? DustMeSelectors_tools.bundle.getString('view.no') : found.selectors))
			.replace('%P1', (found.selectors == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
			.replace('%2', (found.rules == 0 ? DustMeSelectors_tools.bundle.getString('view.no') : found.rules))
			.replace('%P2', (found.rules == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
			.replace('%3', ((found.limit - found.selectors == 0) 
							? '' 
							: DustMeSelectors_tools.bundle.getString('view.cleaning.missed')
								.replace('%1', (found.limit - found.selectors))
							))
			));

	//now show the viewcleaning groupbox, which contains
	//the cleaning options and the save and cancel buttons
	//nb. the cancel button simply reloads the original view
	//exactly as if you'd just re-selected the same host from the menu
	viewdoc.getElementById('dms-viewcleaning').setAttribute('hidden', 'false');
	
	//then set focus on the radiogroup
	viewdoc.getElementById('dms-viewcleaning-optiongroup').focus();
};


//get the cleaned CSS to save to a file or copy to the clipboard
DustMeSelectors_browser.getCleanedCSS = function(csstext, saveoption)
{
	//if the save option is "commented" we need to consider 
	//the possibility that a marked rule already has comments inside it
	//because any such comments would prematurely-closed our marking comments, 
	//leaving their trailing symbols exposed and creating syntax errors, 
	//so what we're going to do is identify any applicable comments, 
	//and then escape their closing symbol so they don't close the comment
	//ie. "/* hello world */" would become "/* hello world *\/"
	if(saveoption == 'commented')
	{
		//so, if the stylesheet has any marked whole rules 
		//(since marked single selectors won't contain comments
		// (or if they do, we won't have identified them, since 
		//  the cleaning process temporarily removes all comments))
		if(/[\ufdd2]/.test(csstext))
		{
			//split the text by its rule-start delimiter, then iterate 
			//through the resulting array (starting from [1] since 
			//the first member is inevitably before the first rule)
			//then for each chunk that contains a comment, split by 
			//the rule-end delimiter (since the comment must be before it, 
			//and we don't want to do this to comments that aren't inside rules)
			//then escape the closing comment symbol(s) contained in the first part
			//then re-join each part and then the whole thing to restore the original marks
			csstext = csstext.split('\ufdd2');
			for(var i = 1; i < csstext.length; i ++)
			{
				if(/(\/\*([^*]|(\*+([^*\/])))*\*+\/)/gm.test((csstext[i] = csstext[i].split('\ufdd3'))[0]))
				{
					csstext[i][0] = csstext[i][0].replace(/(\*\/)/g, '*\\/');
				}
				csstext[i] = csstext[i].join('\ufdd3');
			}
			csstext = csstext.join('\ufdd2');
		}
		
		//now parse the markers into opening and closing comment symbols
		//using the specific syntax defined in preferences 
		//nb. which is defined there so that power users can change it 
		csstext = csstext.replace(/[\ufdd0\ufdd2]/g, DustMeSelectors_preferences.getPreference('string', 'cleanedcommentstart'));
		csstext = csstext.replace(/[\ufdd1\ufdd3]/g, DustMeSelectors_preferences.getPreference('string', 'cleanedcommentend'));
	}
	
	//else if the save option is "removed" we have no such worries :-)
	//we simply have to remove everything between (and including) each pair of markers
	else
	{
		csstext = csstext.replace(/([\ufdd0\ufdd2][^\ufdd1\ufdd3]+[\ufdd1\ufdd3])/gim, '');
	}
	
	//return the cleaned CSS
	return csstext;
};


//generate an updated stylesheet from active cleaning data
//then pass it through the filesystem to prompt the user to save it
DustMeSelectors_browser.generateCleanedStylesheet = function()
{
	//just in case we don't have cleaning data, just exit
	//nb. although if the buttons are visible then we always will
	//but this condition is jic an error causes them to appear at the wrong time
	if(!DustMeSelectors_browser.cleaningdata) { return; }
	
	//save a reference to the viewdialog document 
	var viewdoc = DustMeSelectors_browser.viewdialog.document;

	//get the cleaning save option from the radiogroup
	//which has two radios, each of which stores a value 
	//either "commented" or "removed" to specify whether 
	//marked selectors should be, er, commented or removed
	var saveoption = viewdoc.getElementById('dms-viewcleaning-optiongroup').selectedItem.getAttribute('value');

	//save a shortcut to the cleaningdata 
	var cleaningdata = DustMeSelectors_browser.cleaningdata;
	
	//then get the cleaned csstext according to the save option
	var csstext = DustMeSelectors_browser.getCleanedCSS(cleaningdata.csstext, saveoption);
	
	
	//now define a filename for saving a cleaned version of the stylesheet
	//which is extracted from the last part of the URL path, 
	//stripped of its existing extension, plus any query data 
	//or location hash, and then parsed with the cleanedfilename preference
	//nb. which is defined there so that power users can change it 
	//eg. by default "/styles/main.debug.css" would become "main-cleaned.css"
	var filename = DustMeSelectors_preferences.getPreference('string', 'cleanedfilename')
					.replace('%s', 
						(filename = cleaningdata.url.split('/'))[filename.length - 1]
							.split('?')[0]
							.split('#')[0]
							.replace(/((?:\.[\w]+)*)$/, ''));

	//then pass the filename and csstext to the filesystem save function 
	//which will create a filepicker dialog so the user can choose a save location,
	//get any necessary overwrite confirmation and create the specified file
	//also pass the reset function as the save onfilesaved callback 
	//so that a succesful save will revert to the normal selectors view
	DustMeSelectors_filesystem.saveCleanedStylesheet(filename, csstext, 
	
	//then if the save is completed successfully
	//nb. we only do this if the file was saved, not if the user pressed 
	//cancel in the picker, because they may have only pressed that 
	//in order to change the settings then save again; in order to 
	//cancel the whole thing they must press the cleaner's cancel button
	function()
	{
		//delete any active cleaning data and reset the stylesheet cleaner 
		delete DustMeSelectors_browser.cleaningdata;
		DustMeSelectors_browser.resetStylesheetCleaner();
	
		//show the viewinfo saved icon, which has a tooltip with an 
		//onpopuphidden event, so it re-hides the icon after you've seen the tooltip :-)
		//however the user might have seen it before, so hide it anyway after 7 seconds
		//but first clear any instance of the timer that might still be running
		var infoicon = viewdoc.getElementById('dms-viewinfo-saved');
		infoicon.setAttribute('hidden', false);
		if(infoicon.__hider){ clearTimeout(infoicon.__hider); }
		infoicon.__hider = setTimeout(function()
		{
			if(infoicon)
			{
				infoicon.setAttribute('hidden', true);
			}
		}, 7000);

		//then re-compile and display data for the selected host
		DustMeSelectors_browser.viewSavedDataForHost(viewdoc.getElementById('dms-hostsindexmenu').selectedItem.getAttribute('value'), true);	
	});
};


//hide the stylesheet cleaning interface and reset the unused selectors view
//nb. we don't need to reset the progressmeter, because the re-compile will do that
DustMeSelectors_browser.resetStylesheetCleaner = function(abort)
{
	//save a reference to the viewdialog document
	var viewdoc = DustMeSelectors_browser.viewdialog.document;

	//re-show the viewfooter groupbox and hide the viewcleaner controls (might not be necessary but jic)
	viewdoc.getElementById('dms-viewfooter').setAttribute('hidden', false);
	viewdoc.getElementById('dms-viewcleaning').setAttribute('hidden', true);

	//hide the progress dialog (might not be necessary but jic) 
	viewdoc.getElementById('dms-viewprogress').setAttribute('hidden', true);
	
	//then remove the cleaning class in the viewselectors 
	//browser document body so the view events work again
	//nb. but first check it has one in case the browser is empty at the time
	if(viewdoc.getElementById('dms-viewselectorsbrowser').contentDocument)
	{
		viewdoc.getElementById('dms-viewselectorsbrowser').contentDocument.querySelector('body').className = '';
	}
};


//menu command function: copy cleaned CSS to the clipboard
DustMeSelectors_browser.copyCleaned = function()
{
	//just in case we don't have cleaning data, just exit
	//nb. although if the buttons are visible then we always will
	//but this condition is jic an error causes them to appear at the wrong time
	if(!DustMeSelectors_browser.cleaningdata) { return; }
	
	//save a reference to the viewdialog document 
	var viewdoc = DustMeSelectors_browser.viewdialog.document;

	//get the cleaning save option from the radiogroup
	//which has two radios, each of which stores a value 
	//either "commented" or "removed" to specify whether 
	//marked selectors should be, er, commented or removed
	var saveoption = viewdoc.getElementById('dms-viewcleaning-optiongroup').selectedItem.getAttribute('value');

	//save a shortcut to the cleaningdata 
	var cleaningdata = DustMeSelectors_browser.cleaningdata;
	
	//then get the cleaned csstext according to the save option
	var csstext = DustMeSelectors_browser.getCleanedCSS(cleaningdata.csstext, saveoption);

	//now copy that to the clipboard
	Components.classes["@mozilla.org/widget/clipboardhelper;1"]
		.getService(Components.interfaces.nsIClipboardHelper)
		.copyString(csstext);
	
	//wait a moment then clear the menu open flag
	//we do this pause so that the enter command doens't fire the event on the underlying target
	//and without the pause this would happen before the subsequent event
	window.setTimeout(function() { DustMeSelectors_browser.keymenuopen = false; }, 500);
};


//toggle group display
DustMeSelectors_browser.toggleGroupDisplay = function(heading, forceopen)
{
	//get a reference to the group list, if any,
	//and hide or show it as applicable
	//either reversing its current state, 
	//or setting a forced state, if specified
	var list = heading.nextSibling;
	if(list)
	{
		if(typeof(forceopen) !== 'boolean')
		{
			forceopen = list.style.display == 'none';
		}
		
		if(forceopen)
		{
			list.style.display = 'block';
			heading.className = heading.className.replace(/( closed)/g, '');
		}
		else
		{
			list.style.display = 'none';
			heading.className += ' closed';
		}
	}
};


//view dialog log data keystroke handler
DustMeSelectors_browser.logKeystrokeHandler = function(e, doc, viewdoc)
{
	//if this is tab key
	if(e.keyCode == KeyEvent.DOM_VK_TAB)
	{
		//clear the keymenuopen flag
		DustMeSelectors_browser.keymenuopen = false;
	}
	
	//if this is enter or space key
	if(e.keyCode == KeyEvent.DOM_VK_RETURN || e.keyCode == KeyEvent.DOM_VK_SPACE)
	{
		//if the menu is already open, do nothing here
		if(DustMeSelectors_browser.keymenuopen == true) { return true; }
			
		//get the closest target URL
		var target = DustMeSelectors_browser.getTargetURL(e.target);
		
		//then if we didn't find one just prevent default and we're done
		if(target.url === null)
		{
			e.preventDefault();
			return false;
		}
		
		//else define a dms:url attribute on the contextmenu item
		//that its command event can then use to open the specified URL
		viewdoc.getElementById('dms-viewlogcontext-url').setAttributeNS
			('http://www.brothercake.com/dustmeselectors', 'dms:url', target.url);

		//now get a reference to this browser element and its current screen position
		var browser = viewdoc.getElementById('dms-viewlogbrowser');
		var browserpos = { 'left' : browser.boxObject.screenX, 'top' : browser.boxObject.screenY };

		//get the position of the target node relative to its containing document
		var targetpos = { 'left' : target.node.offsetLeft, 'top' : target.node.offsetTop };
		var tmp = target.node.offsetParent;
		while(tmp)
		{
			targetpos.left += tmp.offsetLeft;
			targetpos.top += tmp.offsetTop;
			tmp = tmp.offsetParent;
		}

		//add the target height to its top position
		//so that the popup will be anchored underneath it
		targetpos.top += target.node.offsetHeight;

		//subtract the browser window scrolling offsets
		targetpos.left -= browser.contentWindow.pageXOffset;
		targetpos.top -= browser.contentWindow.pageYOffset;

		//open the context menu popup at the computed position
		viewdoc.getElementById('dms-viewlogcontext').showPopup
			(browser, (browserpos.left + targetpos.left), (browserpos.top + targetpos.top));

		//set the keymenuopen flag
		DustMeSelectors_browser.keymenuopen = true;
	}
};


//view dialog selection and keystroke handler
DustMeSelectors_browser.viewSelectionHandler = function(e, doc, viewdoc, datatype)
{
	//save the target node
	var target = e.target;

	//save a reference to the context menu popup
	var popup = viewdoc.getElementById('dms-view' + datatype + 'context');
	
	//get a reference to the browser's content window
	var contentwindow = viewdoc.getElementById('dms-view' + datatype + 'browser').contentWindow;

	//if this is a keyup event
	if(e.type == 'keyup')
	{
		//if this is tab key
		//if(e.keyCode == 9)
		if(e.keyCode == KeyEvent.DOM_VK_TAB)
		{
			//clear all existing selections fully
			DustMeSelectors_browser.clearAllSelectedTargets(false);

			//if the target is a list item, select or unselect it as applicable
			if(e.target.nodeName.toLowerCase() == 'li')
			{
				if(target.className.indexOf('selected') == -1)
				{
					DustMeSelectors_browser.selectTarget(target.firstChild, 'selected');
				}
				else
				{
					DustMeSelectors_browser.clearSelectedTarget(target.firstChild);
				}
			}

			//store this item as current focus
			DustMeSelectors_browser.hasfocus = target;

			//clear the open flag
			DustMeSelectors_browser.keymenuopen = false;
		}

		//if this is the up or down arrow key and the shift key is pressed
		//if((e.keyCode == 38 || e.keyCode == 40) && e.shiftKey)
		if((e.keyCode == KeyEvent.DOM_VK_UP || e.keyCode == KeyEvent.DOM_VK_DOWN) && e.shiftKey)
		{
			//if the cleaning function is active then ignore this event and prevent default
			if(doc.querySelector('body').className == 'cleaning') 
			{ 
				e.preventDefault();
				return; 
			}
			
			//if we have no last selection just return 
			//eg. if shift arrow is pressed when the target is a group heading
			//(and this is simpler than checking the target)
			if(DustMeSelectors_browser.lastselection.length == 0) { return true; }
			
			//select the next node to move to, either the previous sibling for up arrow
			//or the next sibling for down arraw, which will be null if there isn't one
			//if(e.keyCode == 38)
			if(e.keyCode == KeyEvent.DOM_VK_UP)
			{
				var sibling = DustMeSelectors_browser
					.lastselection[DustMeSelectors_browser.lastselection.length - 1].parentNode.previousSibling;
			}
			else
			{
				sibling = DustMeSelectors_browser
					.lastselection[DustMeSelectors_browser.lastselection.length - 1].parentNode.nextSibling;
			}

			//if we have a sibling
			if(sibling != null)
			{
				//if we don't have a stored selection group, or it matches this target
				if(DustMeSelectors_browser.selectiongroup == null
					|| DustMeSelectors_browser.selectiongroup == sibling.parentNode.parentNode)
				{
					//move focus to it so that we can continue to tab from it
					sibling.focus();

					//save its first child selector as view target
					DustMeSelectors_browser.viewtarget = sibling.firstChild;

					//select or unselect this node as appropriate
					if(sibling.className.indexOf('selected') == -1)
					{
						DustMeSelectors_browser.selectTarget(sibling.firstChild, 'selected');
					}
					else
					{
						DustMeSelectors_browser.clearSelectedTarget(sibling.firstChild);
					}
				}
			}
			
			//remove any residual text-range selections
			contentwindow.getSelection().removeAllRanges();

			//block any default action 
			e.preventDefault();
		}

		//if this is enter or space key
		//if(e.keyCode == 13 || e.keyCode == 32)
		if(e.keyCode == KeyEvent.DOM_VK_RETURN || e.keyCode == KeyEvent.DOM_VK_SPACE)
		{
			//if the menu is already open, do nothing here
			if(DustMeSelectors_browser.keymenuopen == true) { return true; }
			
			//if the target is a clean button, stop propagation 
			//so it doesn't bubble up to the group URL heading, then do nothing
			//nb. the button itself has a separate click handler, so that 
			//it responds to Enter or Space according to platform convention
			//*** this still lets the event through and opens the contextmenu 
			//*** IF you click the button with the mouse, and then you get a 
			//*** warning dialog, then you press enter or space to accept that
			//*** which is why we needed to preventDefault on the button 
			//*** which blocks its active effect, but we make up for that with 
			//*** focus (which is less than ideal, but it's fuctional for now)
			if(target.parentNode.className == 'cleanable')
			{
				e.stopPropagation();
				return true;
			}

			//if the target is a group heading, 
			if(target.nodeName.toLowerCase() == 'h3')
			{
				//if the shift-key is pressed that's the expand/collapse shortcut
				if(e.shiftKey)
				{
					//so first work out whether this group should be expanded or collapsed
					//then iterate through all the group headings and force them to that state
					var forceopen = target.nextSibling.style.display == 'none';
					var headings = doc.getElementsByTagName('h3');
					for(var i = 0; i < headings.length; i ++)
					{
						DustMeSelectors_browser.toggleGroupDisplay(headings[i], forceopen);
					}

					//remove any residual text-range selections
					contentwindow.getSelection().removeAllRanges();
					
					//then scroll the target group into view 
					//because this action could cause it to move quite signigicantly
					//** this moves it to the top, can we move it to where it was before?
					//** ie. so the group heading is still in the same relative position
					doc.documentElement.scrollTop = target.parentNode.previousSibling.offsetTop;
				}
				
				//otherwise just pass the target heading itself for state reversion
				else
				{
					DustMeSelectors_browser.toggleGroupDisplay(target);
				}
				
				//then we're done
				return true;
			}

			//else if the cleaning function is active but the cleaned output
			//is not ready, then ignore this event and prevent default
			if(doc.querySelector('body').className == 'cleaning' && !DustMeSelectors_browser.cleaningdata) 
			{ 
				e.preventDefault();
				return; 
			}
			
			//else the target is either an H2 group or cleaning output URL heading, or a single selector LI
			//get a reference to this browser element and its current screen position
			var browser = viewdoc.getElementById('dms-view' + datatype + 'browser');
			var browserpos = { 'left' : browser.boxObject.screenX, 'top' : browser.boxObject.screenY };

			//get the position of the target relative to its containing document
			var targetpos = { 'left' : target.offsetLeft, 'top' : target.offsetTop };
			var tmp = target.offsetParent;
			while(tmp)
			{
				targetpos.left += tmp.offsetLeft;
				targetpos.top += tmp.offsetTop;
				tmp = tmp.offsetParent;
			}

			//add the target height to its top position
			//so that the popup will be anchored underneath it
			targetpos.top += target.offsetHeight;

			//subtract the browser window scrolling offsets
			targetpos.left -= browser.contentWindow.pageXOffset;
			targetpos.top -= browser.contentWindow.pageYOffset;

			//open the context menu popup at the computed position
			popup.showPopup(browser, (browserpos.left + targetpos.left), (browserpos.top + targetpos.top));

			//set the open flag
			DustMeSelectors_browser.keymenuopen = true;

			//save the view target, dialog document and browser document properties
			DustMeSelectors_browser.viewtarget = target.firstChild;
			DustMeSelectors_browser.viewdocument = viewdoc;
			DustMeSelectors_browser.document = doc;

			//if the event target was a list items
			if(target.nodeName.toLowerCase() == 'li')
			{
				//enable the delete item for all selectors
				DustMeSelectors_browser.toggleViewContextItems('mark', false, datatype);
			}
			
			//else if it's a URL heading when the cleaned output is ready
			else if(target.nodeName.toLowerCase() == 'h2' && DustMeSelectors_browser.cleaningdata)
			{
				//enable the copy item
				DustMeSelectors_browser.toggleViewContextItems('copy', false, datatype);
			}

			//else if it's a URL heading which is not a "cleaning" status heading
			else if(target.nodeName.toLowerCase() == 'h2' && target.className.indexOf('cleaning') < 0)
			{
				//save the heading as the new target
				DustMeSelectors_browser.viewtarget = target;

				//half-select all the items in the group
				//which is the same as selected programatically, but visually different via CSS
				var items = DustMeSelectors_browser.viewtarget.nextSibling.getElementsByTagName('li');
				for(var i=0; i<items.length; i++)
				{
					DustMeSelectors_browser.selectTarget(items[i].firstChild, 'half-selected');
				}

				//disable all items
				DustMeSelectors_browser.toggleViewContextItems('mark', true, datatype);

				//enable the delete item for all selectors if this group is not empty
				if(items.length > 0)
				{
					DustMeSelectors_browser.toggleViewContextItems('markall', false, datatype);
				}
			}
		}

		//if this is the backspace/delete key
		//if(e.keyCode == 8)
		if(e.keyCode == KeyEvent.DOM_VK_BACK_SPACE || e.keyCode == KeyEvent.DOM_VK_DELETE)
		{
			//if the cleaning function is active then ignore this event and prevent default
			if(doc.querySelector('body').className == 'cleaning') 
			{ 
				e.preventDefault();
				return; 
			}
			
			//if the event target was a list items and its selected
			if(target.nodeName.toLowerCase() == 'li' && target.className.indexOf('selected') != -1)
			{
				//save the view target, dialog document and browser document properties
				DustMeSelectors_browser.viewtarget = target.firstChild;
				DustMeSelectors_browser.viewdocument = viewdoc;
				DustMeSelectors_browser.document = doc;

				//initiate the mark-un|selected action
				DustMeSelectors_browser.markSelector(datatype);
			}
		}
	}

	/** NWAM (3) **/

	//or if this is a mousedown event on the left button
	else if(e.type == 'mousedown' && e.which == 1)
	{
		//if the target is a group header
		if(target.nodeName.toLowerCase() == 'h3')
		{
			//if the target has no next-sibling then it's just a message
			//so just ignore the event, ie. it only works on collapsible groups
			//** I suppose we could make it work by adding empty containers
			//** but that would change lots of existing node relationships
			//** and could break a whole bunch of dom and css references
			if(!target.nextSibling) { return false; }
					 
			//if the shift-key is pressed that's the expand/collapse shortcut
			if(e.shiftKey)
			{
				//so first work out whether this group should be expanded or collapsed
				//then iterate through all the group headings and force them to that state
				var forceopen = target.nextSibling.style.display == 'none';
				var headings = doc.getElementsByTagName('h3');
				for(var i = 0; i < headings.length; i ++)
				{
					DustMeSelectors_browser.toggleGroupDisplay(headings[i], forceopen);
				}
			
				//remove any residual text-range selections
				contentwindow.getSelection().removeAllRanges();
				
				//then scroll the target group into view 
				//because this action could cause it to move quite signigicantly
				//** this moves it to the top -- can we move it under the mouse?
				//** ie. so the group heading is still in the same relative position
				doc.documentElement.scrollTop = target.parentNode.previousSibling.offsetTop;
			}
			
			//otherwise just pass the target heading itself for state reversion
			else
			{
				DustMeSelectors_browser.toggleGroupDisplay(target);
			}
			
			//then we're done
			return false;
		}

		/** NWAM (4) **/

		//else if the cleaning function is active then ignore this event and prevent default
		if(doc.querySelector('body').className == 'cleaning') 
		{ 
			e.preventDefault();
			return false; 
		}
		
		//store the event target property, converted to target <q> selector
		//or if we don't get a node back just clear all selected targets, and we're done
		DustMeSelectors_browser.viewtarget = DustMeSelectors_browser.getTargetSelector(target);
		if(DustMeSelectors_browser.viewtarget == null)
		{
			DustMeSelectors_browser.clearAllSelectedTargets(false);
			return false;
		}

		//detect option modifiers - shift for range selection
		//and ctrl/cmd for multiple selection, as per platform
		//the double-if is so that cmd takes precedence if both are pressed
		//(because mac also has a ctrl key, but it's used for completely different things)
		var option = 'none';
		if(e.shiftKey) { option = 'range'; }
		if(e[DustMeSelectors_browser.command]) { option = 'multiple'; }

		//if we're not using an option, clear all selected targets fully
		if(option == 'none')
		{
			DustMeSelectors_browser.clearAllSelectedTargets(false);
		}

		//if we are using an option, only clear half-selections
		else
		{
			DustMeSelectors_browser.clearAllSelectedTargets(true);
		}

		//if the parent list item is already highlighted
		if(DustMeSelectors_browser.viewtarget.parentNode.className.indexOf('selected') != -1)
		{
			//if the "multiple" option is in use
			//de-highlight the parent list-item
			//and remove this target from the lastselection array
			if(option == 'multiple')
			{
				DustMeSelectors_browser.clearSelectedTarget(DustMeSelectors_browser.viewtarget);
			}
		}

		//if it's not already highlighted
		else
		{
			//if we don't have a stored selection group, or it matches this target
			if(DustMeSelectors_browser.selectiongroup == null
				|| DustMeSelectors_browser.selectiongroup == DustMeSelectors_browser.viewtarget.parentNode.parentNode.parentNode)
			{
				//highlight the parent list-item
				//and add this target to the lastselection array
				DustMeSelectors_browser.selectTarget(DustMeSelectors_browser.viewtarget, 'selected');
			}
		}

		//if the "range" option is in use
		if(option == 'range')
		{
			//if we don't have a stored selection group, or it matches this target
			if(DustMeSelectors_browser.selectiongroup == null
				|| DustMeSelectors_browser.selectiongroup == DustMeSelectors_browser.viewtarget.parentNode.parentNode.parentNode)
			{
				//iterate to find the extent of items that are now/already selected
				//(ie. between this selection and the previous one, but they might 
				// be in reverse order, so we need to sort once we have the indices)
				var nowselected = [-1, -1], list = DustMeSelectors_browser.viewtarget.parentNode.parentNode;
				var items = list.getElementsByTagName('li');
				for(i=0; i<items.length; i++)
				{
					if(items[i].firstChild == DustMeSelectors_browser.lastselection[DustMeSelectors_browser.lastselection.length - 2])
					{
						nowselected[0] = i;
					}
					if(items[i].firstChild == DustMeSelectors_browser.viewtarget)
					{
						nowselected[1] = i;
					}
				}
				nowselected.sort(function(a, b) { return a - b; });

				//then iterate between those items and select the unselected ones
				for(i=nowselected[0]; i<=nowselected[1]; i++)
				{
					if(items[i].className.indexOf('selected') == -1)
					{
						DustMeSelectors_browser.selectTarget(items[i].firstChild, 'selected');
					}
				}
			}

			//remove any residual text-range selections 
			contentwindow.getSelection().removeAllRanges();
		}
	}
};


//view dialog log data context menu handler
DustMeSelectors_browser.logContextHandler = function(e, doc, viewdoc)
{
	//get the closest target URL
	var target = DustMeSelectors_browser.getTargetURL(e.target);
	
	//then if we didn't find one just prevent default and we're done
	if(target.url === null)
	{
		e.preventDefault();
		return false;
	}
	
	//else define a dms:url attribute on the contextmenu item
	//that its command event can then use to open the specified URL
	viewdoc.getElementById('dms-viewlogcontext-url').setAttributeNS
		('http://www.brothercake.com/dustmeselectors', 'dms:url', target.url);
};

//get a target URL from log keystroke and context actions
DustMeSelectors_browser.getTargetURL = function(target)
{
	//iterate upwards from the target until we either run out of ndoes
	//or we find one with an "isurl" flag, indicating that it contains a URL
	//then save the URL to a var, which will stay null if we don't find one
	//nb. the URL might have whitespace around it because of the clipboard formatting
	var url = null;
	do
	{
		if(typeof target.isurl !== 'undefined')
		{
			url = target.firstChild.nodeValue.replace(/^\s+|\s+$/g, '');
			break;
		}
	}
	while(target = target.parentNode);

	//then return an object of the target node we got to
	//and the url it contained, or null if we didn't find one
	return { node : target, url : url };
};


//view dialog selectors data context menu handler
DustMeSelectors_browser.viewContextHandler = function(e, doc, viewdoc, datatype)
{
	//if the cleaning function is active
	if(doc.querySelector('body').className == 'cleaning') 
	{ 
		//if the cleaned output is ready, store the <pre> output node as the viewtarget
		//nb. although we don't really need it we should save something for internal consistency
		if(DustMeSelectors_browser.cleaningdata)
		{
			DustMeSelectors_browser.viewtarget = doc.querySelector('pre');
		}
		
		//else ignore this event and prevent default
		else
		{
			e.preventDefault();
			return; 
		}
	}
	
	//else if the target is a URL heading which is not a "cleaning" status heading
	else if(e.target.nodeName.toLowerCase() == 'h2' && e.target.className.indexOf('cleaning') < 0)
	{
		//if we already have a set of selections 
		//and the viewtarget is a different group header
		//then clear all existing selected targets in that group first		
		//* if you make several individual selections, then right-click 
		//* on the H2 heading of an empty group, and then right-click
		//* on the first group's H2 heading, the change of target 
		//* will cause all half-selections in the first group to be lost
		//* ie. it will show every item in the group as fully selected
		//if(DustMeSelectors_browser.lastselection.length > 0 
		//	&& DustMeSelectors_browser.viewtarget.nodeName.toLowerCase() == 'h2'
		//	&& DustMeSelectors_browser.viewtarget != e.target)
		
		//** I've had to remove that condition to fix an apparently un-addressible bug
		//** where if you right-click the H2 header, then left-click the same header, 
		//** there's NO EVENT dispatched on the header (from oncontextmenuclose, as it were, 
		//** I expected a mouse event on whatever you clicked outside it that made it close)
		//** so then when you right-click the same header and this time actually
		//** select the contextmenu mark item, it throws a selection reference erro
		//** because none of the conditions we have can detect any change in context
		//** so until I can get my head round exactly why the selections data is lost ...
		//** we'll just have to do this every time, which means we lose all half-selections
		//** and that's a real shame cos they looked really nice (and were tricky to implement)
		//** though they didn't actually serve any purpose, so it's nothing we can't live with for now!
		{
			DustMeSelectors_browser.clearAllSelectedTargets(false);
		}
		
		//then store heading as the viewtarget
		DustMeSelectors_browser.viewtarget = e.target;
	}

	//otherwise store the event target property, converted to target <q> selector
	//but if we don't get a node back, clear all targets fully, suppress the default action and we're done
	else
	{
		DustMeSelectors_browser.viewtarget = DustMeSelectors_browser.getTargetSelector(e.target);
		if(DustMeSelectors_browser.viewtarget == null)
		{
			DustMeSelectors_browser.clearAllSelectedTargets(false);
			e.preventDefault();
			return false;
		}
	}

	//if we're still going, also save the dialog document and inner content document
	//for use by the browser element's actual context menu that subsequently appears
	DustMeSelectors_browser.viewdocument = viewdoc;
	DustMeSelectors_browser.document = doc;

	//if the view target is a selector
	if(DustMeSelectors_browser.viewtarget.nodeName.toLowerCase() == 'q')
	{
		//if this item is not already selected, this is a primary single selection
		//ie. to select an item and immediately act on
		if(DustMeSelectors_browser.viewtarget.parentNode.className.indexOf('selected') == -1)
		{
			//clear all existing selections fully
			DustMeSelectors_browser.clearAllSelectedTargets(false);

			//select this item
			DustMeSelectors_browser.selectTarget(DustMeSelectors_browser.viewtarget, 'selected');
		}

		//enable the delete item 
		DustMeSelectors_browser.toggleViewContextItems('mark', false, datatype);
	}

	//or if the target is a URL heading
	else if(DustMeSelectors_browser.viewtarget.nodeName.toLowerCase() == 'h2')
	{
		//half-select all the items in the group that aren't already fully selected
		//half-selected is the same as selected programatically, but visually different via CSS
		var items = DustMeSelectors_browser.viewtarget.nextSibling.getElementsByTagName('li');
		for(var i=0; i<items.length; i++)
		{
			if(items[i].className != 'selected')
			{
				DustMeSelectors_browser.selectTarget(items[i].firstChild, 'half-selected');
			}
		}

		//disable all items
		DustMeSelectors_browser.toggleViewContextItems('mark', true, datatype);

		//enable the delete item for all selectors if this group is not empty
		if(items.length > 0)
		{
			DustMeSelectors_browser.toggleViewContextItems('markall', false, datatype);
		}
	}
	
	//or if the target is the cleaned output PRE
	else if(DustMeSelectors_browser.viewtarget.nodeName.toLowerCase() == 'pre')
	{
		//enable the copy item 
		DustMeSelectors_browser.toggleViewContextItems('copy', false, datatype);
	}
};

//get a target <q> selector from view click and context actions
DustMeSelectors_browser.getTargetSelector = function(target)
{
	//convert clicks on <cite> (line number) or <li> (selector item)
	//or <b> or <em> (syntax wrapper) to the item <q> element
	if(/^(li)$/i.test(target.nodeName))
	{
		target = target.firstChild;
	}
	if(/^(cite)$/i.test(target.nodeName))
	{
		target = target.previousSibling;
	}
	if(/^(em|b)$/i.test(target.nodeName))
	{
		target = target.parentNode;
	}

	//then if the view target is a selector, return it
	if(/^(q)$/i.test(target.nodeName)) { return target; }

	//otherwise return null
	return null;
};

//select a single target
DustMeSelectors_browser.selectTarget = function(target, classname)
{
	target.parentNode.className = classname;
	DustMeSelectors_browser.lastselection.push(target);
	DustMeSelectors_browser.selectiongroup = target.parentNode.parentNode.parentNode;
};

//clear a single selected target
DustMeSelectors_browser.clearSelectedTarget = function(target)
{
	target.parentNode.className = '';
	for(i=0; i<DustMeSelectors_browser.lastselection.length; i++)
	{
		if(DustMeSelectors_browser.lastselection[i] == target)
		{
			DustMeSelectors_browser.lastselection.splice(i, 1);
			break;
		}
	}
	if(DustMeSelectors_browser.lastselection.length == 0)
	{
		DustMeSelectors_browser.selectiongroup = null;
	}
};

//clear all selected targets; if the halfonly argument is true
//only clear half-selected items, and ignore fully selected ones
DustMeSelectors_browser.clearAllSelectedTargets = function(halfonly)
{
	for(var i=0; i<DustMeSelectors_browser.lastselection.length; i++)
	{
		if(halfonly == false || DustMeSelectors_browser.lastselection[i].parentNode.className == 'half-selected')
		{
			DustMeSelectors_browser.lastselection[i].parentNode.className = '';
			DustMeSelectors_browser.lastselection.splice(i--, 1);
		}
	}
	if(DustMeSelectors_browser.lastselection.length == 0)
	{
		DustMeSelectors_browser.selectiongroup = null;
	}
};


//show/hide view context items and toggle their disabled property
DustMeSelectors_browser.toggleViewContextItems = function(items, isdisabled, datatype)
{
	var menuitems = this.viewdialog.document.getElementById('dms-viewselectorscontext').getElementsByTagName('menuitem');
	for(var i = 0; i < menuitems.length; i ++)
	{
		menuitems[i].setAttribute('hidden', 'true');
	}
	
	items = items.split(',');
	for(var i=0; i<items.length; i++)
	{
		var markall = items[i] == 'markall';
		items[i] = items[i].replace('markall', 'mark');
		var menuitem = this.viewdialog.document.getElementById('dms-view' + datatype + 'context-' + items[i]);
		menuitem.setAttribute('disabled', isdisabled);
		menuitem.setAttribute('hidden', 'false');
		if(items[i] == 'mark')
		{
			if(markall == true)
			{
				menuitem.setAttribute('label', DustMeSelectors_tools.bundle
					.getString('view.context.' + (datatype == 'used' ? 'markallunused' : 'markallused'))
					);
			}
			else
			{
				menuitem.setAttribute('label', DustMeSelectors_tools.bundle
					.getString('view.context.' + (datatype == 'used' ? 'markunused' : 'markused'))
					.replace('%P1', (DustMeSelectors_browser.lastselection.length > 1
						? DustMeSelectors_tools.bundle.getString('view.plural')
						: '')));
			}
		}
	}
};


//menu command function: open a URL in firefox 
//that's defined in the menuitem's dms:url attribute
DustMeSelectors_browser.openURL = function(menuitem)
{
	//get the URL referred to by the menuitem attribute
	var url = menuitem.getAttributeNS('http://www.brothercake.com/dustmeselectors', 'url');
	
	//then double-check that it's defined, jic 
	//(although if it isn't this menu shouldn't be open)
	if(url)
	{
		//open the specified URL in a new selected tab, then focus the window
		gBrowser.selectedTab = gBrowser.addTab(url);
		window.focus();
	}

	//wait a moment then clear the menu open flag
	//we do this pause so that the enter command doens't fire the event on the underlying target
	//and without the pause this would happen before the subsequent event
	window.setTimeout(function() { DustMeSelectors_browser.keymenuopen = false; }, 500);
};


//menu command function: mark a selector from the view list and selectors or used object
DustMeSelectors_browser.markSelector = function(datatype)
{
	//get the host name referred to by the select host menu
	var prefname = this.viewdialog.document.getElementById('dms-hostsindexmenu')
		.selectedItem.getAttribute('value');

	//get both selectors and used objects for the selected host
	var data = {
		'selectors' : DustMeSelectors_tools.getDataObject(prefname, 'selectors', {}),
		'used' : DustMeSelectors_tools.getDataObject(prefname, 'used', {})
		};

	//save the inverse reference to the data type
	var notdatatype = datatype == 'used' ? 'selectors' : 'used';

	//count the number of rules and sheets in the data we're using
	var sheets = 0, rules = 0;
	for(var i in data[datatype])
	{
		if(!data[datatype].hasOwnProperty(i)) { continue; }
		if(typeof data[datatype][i] == 'object')
		{
			sheets++;
			for(var j in data[datatype][i])
			{
				if(!data[datatype][i].hasOwnProperty(j)) { continue; }

				rules++;
			}
		}
	}

	//get a reference to the heading for this group
	if(this.viewtarget.nodeName.toLowerCase() == 'h2')
	{
		var heading = this.viewtarget.nextSibling.firstChild;
	}
	else
	{
		heading = this.viewtarget.parentNode.parentNode.previousSibling;
	}

	//if we have a focused element this was keyboard initiated
	//so in that case move the focus to the group URL header, then nullify it
	if(this.hasfocus != null)
	{
		//the target is a list item
		if(this.hasfocus.nodeName.toLowerCase() == 'li')
		{
			this.hasfocus.parentNode.parentNode.previousSibling.focus();
		}
		//the target is already a URL header
		else
		{
			this.hasfocus.focus();
		}
		this.hasfocus = null;
	}

	//count the lastselection array so we know the total difference
	var diff = this.lastselection.length;
	
	//remember the URL key of each selector group we modify
	var groupkeys = {};

	//then for each of the stored targets
	//(that is, while we still have, because we're going to remove them as we go along)
	while(this.lastselection.length > 0)
	{
		//get the selectors group and selector reference from attributes
		//including any unrecognised or malformed class it might have
		i = this.lastselection[0].getAttribute('cite');
		j = this.lastselection[0].getAttribute('class').replace(/[ ](unrecognised|malformed)/g, '').replace('j', '');

		//** just in case the other group doesn't have this stylesheet, define in first
		//** though this should never happen, and only did once, and then I couldn't replicate it!
		if(typeof data[notdatatype][i] == 'undefined')
		{
			data[notdatatype][i] = {};
		}

		//add this selector to the other group
		data[notdatatype][i][j] = data[datatype][i][j];

		//delete it from this group
		delete data[datatype][i][j];
		
		//remove this item from the list
		//and remove it from the selection group
		this.lastselection[0].parentNode.parentNode.removeChild(this.lastselection[0].parentNode);
		this.lastselection.splice(0, 1);
		
		//add this URL key to the groupkeys object, if not already defined
		//nb. there should only be one group, but no harm in being flexible
		if(typeof groupkeys[i] == 'undefined')
		{
			groupkeys[i] = i;
		}
	}

	//reset the selection group property
	DustMeSelectors_browser.selectiongroup = null;

	//count the object as it is now
	var count = 0;
	for(var k in data[datatype][i])
	{
		if(!data[datatype][i].hasOwnProperty(k)) { continue; }
		
		count++;
	}

	//if there are still selectors in this group update the heading text
	if(count > 0)
	{
		heading.setAttribute('tabindex', '0');
		heading.removeChild(heading.firstChild);
		heading.insertBefore(this.viewdialog.document.createTextNode(DustMeSelectors_tools.bundle
			.getString('view.' + (datatype == 'used' ? 'used' : 'warning'))
			.replace('%1', count)
			.replace('%P1', (count == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
			), heading.firstChild);
	}
	//otherwise it's empty
	else
	{
		//change the class and message,
		//remove the list and change the parent group class
		heading.removeAttribute('tabindex');
		while(heading.hasChildNodes()) 
		{ 
			heading.removeChild(heading.firstChild); 
		}
		heading.className =  (datatype == 'used' ? 'warning' : 'okay');
		heading.appendChild(this.viewdialog.document.createTextNode(DustMeSelectors_tools.bundle
			.getString('view.' + (datatype == 'used' ? 'noused' : 'okay'))));
		heading.parentNode.className = 'group ' + (datatype == 'used' ? 'warning' : 'okay');
		heading.parentNode.removeChild(heading.nextSibling);
		
		//then if the h2 group header had a "cleanable" class
		//reset the class and remove the clean button from inside it
		var h2 = heading.parentNode.previousSibling;
		if(h2.className == 'cleanable')
		{
			h2.className = '';
			h2.removeChild(h2.lastChild);
		}
	}

	//decrease the total rules count
	rules -= diff;

	//update the summary description element
	this.updateViewSummary(rules, sheets, null, datatype, null, null);

	//clear the other browser so its forced to recompile next view
	//passing the clearmark flag which tells it not to actually clear the browsers
	//just set an attribute on the browser that says it can be cleared
	this.clearBrowserDocument('dms-view' + notdatatype + 'browser', true);

	//then if we have an active master cleaning processor, abort the APUs
	if(DustMeSelectors.processors && DustMeSelectors.processors.master)
	{
		DustMeSelectors.processors.master.abort();
	}

	//and if we have any active cleaningdata, delete it so the view can reset
	if(DustMeSelectors_browser.cleaningdata)
	{
		delete DustMeSelectors_browser.cleaningdata;
	}
	
	//also hide the progress dialog jic, which can be necessary 
	//if this is coming from the used dialog when the cleaner was 
	//still initialising, but the progressmeter didn't get reset when you 
	//switched to the used tab, because you'd already viewed it this host/session
	this.viewdialog.document.getElementById('dms-viewprogress').setAttribute('hidden', true);

	//reset the abort button class and re-hide it
	var aborter2 = this.viewdialog.document.getElementById('dms-viewcleaning-abort2');
	aborter2.removeAttribute('class');
	aborter2.setAttribute('hidden', true);
	
	//iterate through the groupkeys and re-sort each [notdatatype] object into rule-key order
	//nb. don't need to re-sort the [datatype] objects since we only deleted from them
	for(var i in groupkeys)
	{
		if(groupkeys.hasOwnProperty(i))
		{
			data[notdatatype][i] = DustMeSelectors.resort(data[notdatatype][i]);
		}
	}

	//convert selectors and used objects to JSON and save back to file
	//and add this host to the hostsindex, if it doesn't exist already (** why wouldn't it? **)
	DustMeSelectors_filesystem.dumpToFile(prefname + '.json', DustMeSelectors_tools.Object_toJSONString(data['selectors']));
	DustMeSelectors_filesystem.dumpToFile(prefname.replace('selectors', 'used') + '.json', DustMeSelectors_tools.Object_toJSONString(data['used']));
	DustMeSelectors_tools.updateHostsIndex({ 'host' : prefname }, true);

	//wait a moment then clear the menu open flag
	//we do this pause so that the enter command doens't fire the event on the underlying target
	//and without the pause this would happen before the subsequent event
	window.setTimeout(function() { DustMeSelectors_browser.keymenuopen = false; }, 500);
};


//update the summary description element
DustMeSelectors_browser.updateViewSummary = function(rules, sheets, data, datatype, nb, forcemessage)
{
	//save a reference to the viewdialog document and to the hosts menu
	var doc = this.viewdialog.document;
	var menulist = doc.getElementById('dms-hostsindexmenu');
	
	//get the summary description element and clear any existing content
	var description = doc.getElementById('dms-viewsummary');
	while(description.hasChildNodes())
	{
		description.removeChild(description.firstChild);
	}

	//if the rules and sheets are both not null 
	//and a non-empty item is selected in the hosts menu
	if(rules !== null && sheets !== null && menulist.selectedItem.getAttribute('value') !== '')
	{
		//if the forcemessage argument is not null
		//just write that value directly into the description
		if(forcemessage != null)
		{
			description.appendChild(doc.createTextNode(forcemessage));
		}

		//otherwise if the datatype is log
		else if(datatype == 'log')
		{
			//write a new summary node with the information
			//the value for rules is actually the number of pages
			//and the number for sheets is the number of files
			//plus if the spider operation is incomplete, we add the "so far" scope description 
			//and the "incomplete" phrase at the end, otherwise we add the "in total"
			//scope description and just remove the token at the end
			description.appendChild(
				doc.createTextNode(DustMeSelectors_tools.bundle
					.getString('spider.logsummary')
					.replace('%1', rules)
					.replace('%2', ((sheets - rules) == 0 ? DustMeSelectors_tools.bundle.getString('view.no') : (sheets - rules)))
					.replace('%P1', (rules == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
					.replace('%P2', (sheets - rules == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
					.replace('%P3', DustMeSelectors_tools.bundle.getString('spider.scope.' + (nb == 'incomplete' ? 'incomplete' : 'complete')))
					.replace('%P4', (nb == 'incomplete' ? DustMeSelectors_tools.bundle.getString('spider.incomplete') : ''))
					));

			//if the spider is incomplete show and enable the "resume" button
			if(nb == 'incomplete')
			{
				this.setUIState('viewspider-resume', false);
			}
		}

		//otherwise it's used or selectors
		else
		{
			//write a new summary node with the information
			description.appendChild(doc.createTextNode(DustMeSelectors_tools.bundle
				.getString('view.' + (datatype == 'used' ? 'usedsummary' : 'summary'))
				.replace('%1', (rules == 0 ? DustMeSelectors_tools.bundle.getString('view.no') : DustMeSelectors_tools.format(rules)))
				.replace('%P1', (rules == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
				.replace('%2', (sheets == 0 ? DustMeSelectors_tools.bundle.getString('view.no') : sheets))
				.replace('%P2', (sheets == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
				));
		}
	}
	
	//or if they are both null we're clearing the element entirely
	//but output a single hacky nb-space to maintain the min-height
	else { description.appendChild(doc.createTextNode('\u00a0')); }
};



//menu command function: find redundent selectors
DustMeSelectors_browser.findRedundentSelectors = function(doc)
{
	//if the extension hasn't yet been initialized this session, 
	//then it's because this command has fired before the chrome load event
	//so we'll just have to reject the command and make the user try again
	//(as a simpler alternative to pre-disabling every single UI item,
	// although that's already what happens with the view and clear items)
	if(!DustMeSelectors_browser.beeninitialised) { return; }

	//if the suppressed flag is strictly true, 
	//or the scan is already running, do nothing
	if(DustMeSelectors_browser.suppressed === true || DustMeSelectors.running) { return; }
	

	//***DEV
	//this.benchmarkStart = new Date().getTime();
	
	//update the control settings for the specified input document 
	//or using the default content.document if there isn't one 
	//and save the returned prefname to a local var
	//nb. only autorun passes a specific document, otherwise it's default
	var prefname = this.updateControlSettings((doc || window.content.document).location);
	
	//***DEV
	//window.content.console.log('findRedundentSelectors(prefname="'+prefname+'")');

	//set the status icon to its busy state
	this.setUIState('busy');

	//set the stop items to enabled and the find items to disabled
	this.setUIState('find-stop', false);

	//if we have an input document then this is an autorun initiation
	//so set the openview parameter according to the openafterautorun preference
	//otherwise set it according to the openafterfind preference
	this.openview = DustMeSelectors_preferences.getPreference(
		'boolean', 
		typeof doc != 'undefined'
			? 'openafterautorun' 
			: 'openafterfind'
			);

	//set the donotify parameter the same way 
	//so notification happens after auto or manual run, as per preference
	this.donotify = DustMeSelectors_preferences.getPreference(
		'boolean', 
		typeof doc != 'undefined'
			? 'notifyafterautorun' 
			: 'notifyafterfind'
			);
	
	//set the doboxnotify parameter the same way
	this.doboxnotify = DustMeSelectors_preferences.getPreference(
		'boolean', 
		typeof doc != 'undefined'
			? 'notifyboxafterautorun' 
			: 'notifyboxafterfind'
			);

	//set the running property to true
	DustMeSelectors.running = true;
	
	//now wait a brief moment, then scan the applicable document
	//using the prefname we got by updating the control settings
	//nb. the pause is a threading tactic to give the UI time to update
	//on pages where there's a lot of stylesheets/rules to parse
	window.setTimeout(function()
	{
		DustMeSelectors.getAllSelectors(prefname, (doc || window.content.document));

	}, 10);
};




//save and output the results of the find evaluation
DustMeSelectors_browser.saveAndOutput = function(selectors, used)
{
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
	
	//***DEV
	//window.content.console.log('saveAndOutput(prefname="'+this.prefname+'")');
	
	//convert selectors and used objects to JSON and save to file
	//and add this host to the hostsindex, if it doesn't exist already
	DustMeSelectors_filesystem.dumpToFile(this.prefname + '.json', DustMeSelectors_tools.Object_toJSONString(selectors));
	DustMeSelectors_filesystem.dumpToFile(this.prefname.replace('selectors', 'used') + '.json', DustMeSelectors_tools.Object_toJSONString(used));
	DustMeSelectors_tools.updateHostsIndex({ 'host' : this.prefname }, true);

	//if the running flag is [still] true
	if(DustMeSelectors.running)
	{
		//set the status icon back to its default state
		this.setUIState('status');

		//hide the status label
		this.hideStatusLabel();

		//if we have any active cleaningdata, delete it and reset the cleaning interface
		if(this.cleaningdata)
		{
			delete this.cleaningdata;
			this.resetStylesheetCleaner();
		}
		
		//view the saved selectors, forcing the selectors tab but not forcing focus
		//and pasing the current prefname, so that it shows the data for whichever 
		//page was scanned (which might not be content.document after autorun)
		this.viewSavedSelectors(this.prefname, true, false);

	
		//if the donotify or doboxnotify flag is true 
		//(which is set according to manual/auto preference), 
		//we need to notify that the find operation has finished
		if(this.donotify || this.doboxnotify)
		{
			//get the selectors object for the selected host
			//then pass it to the view-summary-totals method, to get an object of totals
			var totals = DustMeSelectors_tools.getViewSummaryTotals(DustMeSelectors_tools.getDataObject(this.prefname, 'selectors', {}));
			
			//compile that data into a summary notification
			//according to whether we found any stylesheets or not
			if(totals.sheets == 0)
			{
				var notification = DustMeSelectors_tools.bundle.getString('view.none');
			}
			else
			{
				notification = DustMeSelectors_tools.bundle.getString('view.summary')
					.replace('%1', (totals.rules == 0 ? DustMeSelectors_tools.bundle.getString('view.no') : totals.rules))
					.replace('%P1', (totals.rules == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
					.replace('%2', totals.sheets)
					.replace('%P2', (totals.sheets == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')));
			}
	
			//if donotify is true, show the popup notification
			if(this.donotify)
			{
				DustMeSelectors_tools.notify(notification);
			}
			
			//if doboxnotify is true, show the notification box
			if(this.doboxnotify)
			{
				DustMeSelectors_tools.boxnotify(notification);
			}
		}
	}

	//send a stop command to disable the stop menu items
	//and reset the running property to false
	this.stop();

	//enable the view item and clear menu
	this.setUIState('view-clearmenu', false);
	
	//***DEV
	//this.benchmarkEnd = new Date().getTime();
};




//menu command function: stop
DustMeSelectors_browser.stop = function()
{
	//set the running property to false
	DustMeSelectors.running = false;

	//then if the suppressed flag is strictly true, that's all
	if(DustMeSelectors_browser.suppressed === true) { return; }
		
	//set the stop items to disabled and the find items to enable
	this.setUIState('find-stop', true);

	//set the status icon back to its default state
	this.setUIState('status');

	//hide the status label
	this.hideStatusLabel();
};




//set the UI state of menu and status items
DustMeSelectors_browser.setUIState = function(type, arg)
{
	switch(type)
	{
		case 'disable' :

			document.getElementById('dms-statusicon').setAttribute('src',
				'chrome://dustmeselectors/content/statusicon_' + (arg ? 'disabled' : 'default') + '.png');
			document.getElementById('dms-statusicon').setAttribute('tooltiptext',
				(arg ? '' : (DustMeSelectors_tools.bundle.getString('menu.find') 
				+ DustMeSelectors_browser.findkeylabel)));
			document.getElementById('dms-mainmenu-find').setAttribute('disabled', arg);
			document.getElementById('dms-mainmenu-autorun').setAttribute('disabled', arg);
			document.getElementById('dms-mainmenu-sitemap').setAttribute('disabled', arg);
			document.getElementById('dms-statuspopup-sitemap').setAttribute('disabled', arg);
			document.getElementById('dms-mainmenu-preferences').setAttribute('disabled', arg);
			document.getElementById('dms-statuspopup-preferences').setAttribute('disabled', arg);

			//nb. the toolbar button is only present when it's showing on the toolbar
			if(document.getElementById('dms-toolbarbutton'))
			{
				//nb. since disabling the button also disables its menu trigger
				//we don't need to disable all the individual menu items
				document.getElementById('dms-toolbarbutton').setAttribute('style',
					'list-style-image:url(chrome://dustmeselectors/content/statusicon_' + (arg ? 'disabled' : 'default') + '.png)');
				document.getElementById('dms-toolbarbutton').setAttribute('tooltiptext',
					(arg ? '' : (DustMeSelectors_tools.bundle.getString('menu.find') 
					+ DustMeSelectors_browser.findkeylabel)));
					
				//nb. for some unknown reason, setting disabled=false dims the icon in Windows 
				//so we have to either set it to true, or remove it entirely, to prevent that
				if(arg)
				{
					document.getElementById('dms-toolbarbutton').setAttribute('disabled', true);
				}
				else
				{
					document.getElementById('dms-toolbarbutton').removeAttribute('disabled');
				}
			}
			
			//disable view and clear menus on demand, but on re-enable,
			//enable them only if there's data in the hosts index
			var hostscount = DustMeSelectors_tools.count(DustMeSelectors_tools.getHostsIndex());
			this.setUIState('view-clearmenu', (arg || hostscount == 0));
			this.setUIState('clearmenu', (arg || hostscount == 0));

			//hide the status label if disabling
			if(arg) { this.hideStatusLabel(); }

			break;

		case 'busy' :

			document.getElementById('dms-statusicon').setAttribute('src',
				'chrome://dustmeselectors/content/statusicon_busy.gif');
			
			document.getElementById('dms-statusicon').setAttribute('tooltiptext',
				DustMeSelectors_tools.bundle.getString('menu.busy'));

			if(document.getElementById('dms-toolbarbutton'))
			{
				document.getElementById('dms-toolbarbutton').setAttribute('style',
					'list-style-image:url(chrome://dustmeselectors/content/statusicon_busy.gif)');
				
				document.getElementById('dms-toolbarbutton').setAttribute('tooltiptext',
					DustMeSelectors_tools.bundle.getString('menu.busy'));
			}

			break;

		case 'view-clearmenu' :

			document.getElementById('dms-mainmenu-view').setAttribute('disabled', arg);
			document.getElementById('dms-statuspopup-view').setAttribute('disabled', arg);
			document.getElementById('dms-mainmenu-clearmenu').setAttribute('disabled', arg);
			document.getElementById('dms-statuspopup-clearmenu').setAttribute('disabled', arg);

			if(document.getElementById('dms-toolbarbutton'))
			{
				document.getElementById('dms-toolbarpopup-view').setAttribute('disabled', arg);
				document.getElementById('dms-toolbarpopup-clearmenu').setAttribute('disabled', arg);
			}
			
			break;

		case 'clearmenu' :

			document.getElementById('dms-mainmenu-clearmenu').setAttribute('disabled', arg);
			document.getElementById('dms-statuspopup-clearmenu').setAttribute('disabled', arg);

			if(document.getElementById('dms-toolbarbutton'))
			{
				document.getElementById('dms-toolbarpopup-clearmenu').setAttribute('disabled', arg);
			}
			
			break;

		case 'status' :

			document.getElementById('dms-statusicon').setAttribute('src',
				'chrome://dustmeselectors/content/statusicon_default.png');
					
			document.getElementById('dms-mainmenu-clear').setAttribute('disabled', arg);
			document.getElementById('dms-statuspopup-clear').setAttribute('disabled', arg);

			if(document.getElementById('dms-toolbarbutton'))
			{
				document.getElementById('dms-toolbarbutton').setAttribute('style',
					'list-style-image:url(chrome://dustmeselectors/content/statusicon_default.png)');
			}
			
			break;

		case 'find-stop' :

			document.getElementById('dms-statusicon').setAttribute('tooltiptext',
				DustMeSelectors_tools.bundle.getString('menu.' + (arg ? 'find' : 'busy')) 
				+ (arg ? DustMeSelectors_browser.findkeylabel : ''));
			
			document.getElementById('dms-mainmenu-sitemap').setAttribute('disabled', !arg);
			document.getElementById('dms-mainmenu-find').setAttribute('disabled', !arg);
			document.getElementById('dms-mainmenu-autorun').setAttribute('disabled', !arg);
			document.getElementById('dms-mainmenu-clearmenu').setAttribute('disabled', !arg);
			document.getElementById('dms-mainmenu-preferences').setAttribute('disabled', !arg);

			document.getElementById('dms-statuspopup-sitemap').setAttribute('disabled', !arg);
			document.getElementById('dms-statuspopup-clearmenu').setAttribute('disabled', !arg);
			document.getElementById('dms-statuspopup-preferences').setAttribute('disabled', !arg);

			var contextmenuitem = document.getElementById('dms-contextmenu-spider');
			contextmenuitem.setAttribute('disabled', !arg);
			contextmenuitem.setAttribute('image', 
				'chrome://dustmeselectors/content/statusicon_' + (!arg ? 'disabled' : 'default') + '.png');

			if(document.getElementById('dms-toolbarbutton'))
			{
				document.getElementById('dms-toolbarbutton').setAttribute('tooltiptext',
					DustMeSelectors_tools.bundle.getString('menu.' + (arg ? 'find' : 'busy')) 
					+ (arg ? DustMeSelectors_browser.findkeylabel : ''));
				document.getElementById('dms-toolbarpopup-sitemap').setAttribute('disabled', !arg);
				document.getElementById('dms-toolbarpopup-clearmenu').setAttribute('disabled', !arg);
				document.getElementById('dms-toolbarpopup-preferences').setAttribute('disabled', !arg);
			}

			break;

		case 'autorun' :

			document.getElementById('dms-mainmenu-autorun').setAttribute('checked', !arg);

			break;

		case 'statusoverlay' :

			document.getElementById('dms-statusoverlay').setAttribute('hidden', arg);

			break;
			
		case 'contextmenu' :

			document.getElementById('dms-contextmenu-separator').setAttribute('hidden', arg);
			document.getElementById('dms-contextmenu-spider').setAttribute('hidden', arg);

			break;
			
		case 'viewspider' : 
		
			this.viewdialog.document.getElementById('dms-viewspiderbutton').setAttribute('hidden', arg);
			this.setUIState('viewspider-resume', arg);
			
		case 'viewspider-resume' : 
		
			var resumebutton = this.viewdialog.document.getElementById('dms-viewresumebutton');
			resumebutton.setAttribute('hidden', arg);
			resumebutton.setAttribute('disabled', arg);
		
	}
};




//update the status labels
DustMeSelectors_browser.updateStatusLabel = function(rules, sheets)
{
	//save references to the status labels
	//nb. the toolbar label will be null if the button isn't present on the toolbar
	var statuslabel = document.getElementById('dms-statuslabel');
	var toolbarlabel = document.getElementById('dms-toolbarlabel');
	
	//but if the showtoolbarlabel preference is false, just nullify the reference
	//so its subsequent conditions will be false and it won't show or update
	if(!DustMeSelectors_preferences.getPreference('boolean', 'showtoolbarlabel'))
	{
		toolbarlabel = null;
	}

	//show the status labels
	statuslabel.setAttribute('hidden', 'false');
	if(toolbarlabel) { toolbarlabel.setAttribute('hidden', 'false'); }

	//if the rules and sheets arguments 
	//are both strictly null, remove the label values
	//(which in the case of the toolbarlabel, is in its first-element-child)
	if(rules === null && sheets === null)
	{
		statuslabel.removeAttribute('value');
		if(toolbarlabel) { toolbarlabel.firstElementChild.removeAttribute('value'); }
	}

	//else if they're not both strictly null 
	//(as opposed to one or the other), apply the values
	//nb. for the toolbarlabel we only show the stylesheet count
	//otherwise the information gets too crowded and too manic
	else if(!(rules === true && sheets === true))
	{
		statuslabel.setAttribute('value', DustMeSelectors_tools.format(rules) + '/' + sheets);
		if(toolbarlabel) { toolbarlabel.firstElementChild.setAttribute('value', sheets); }
	}

	//if the values are boolean true, it means leave the value and tooltip as it is
};


//hide the status label
DustMeSelectors_browser.hideStatusLabel = function()
{
	//save references to the status labels
	//nb. the toolbar label will be null if the button isn't present on the toolbar
	var statuslabel = document.getElementById('dms-statuslabel');
	var toolbarlabel = document.getElementById('dms-toolbarlabel');
	
	//but if the showtoolbarlabel preference is false, just nullify the reference
	//so its subsequent conditions will be false and it won't show or update
	if(!DustMeSelectors_preferences.getPreference('boolean', 'showtoolbarlabel'))
	{
		toolbarlabel = null;
	}

	//remove the label values
	statuslabel.removeAttribute('value');
	if(toolbarlabel) { toolbarlabel.firstElementChild.removeAttribute('value'); }

	//hide the labels
	statuslabel.setAttribute('hidden', 'true');
	if(toolbarlabel) { toolbarlabel.setAttribute('hidden', 'true'); }
};



