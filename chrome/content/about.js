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


//load the addon data from install.rdf using the AddonManager 
//nb. this is called immediately rather than waiting for the chrome load
//so there's no visible change of size when the dynamic content is added
//(which means of course that we have to put the script after the content)
Components.utils.import("resource://gre/modules/AddonManager.jsm");
AddonManager.getAddonByID('{3c6e1eed-a07e-4c80-9cf3-66ea0bf40b37}', function(addon) 
{
	
	//save a shortcut to the xlink namespace 
	var xns = 'http://www.w3.org/1999/xlink';
	

	//define the version number, and update the version query parameter in the xlink:href
	var vlabel = document.getElementById('dms-about-version');
	vlabel.appendChild(document.createTextNode(addon.version));
	vlabel.setAttributeNS(xns, 'xlink:href', vlabel.getAttributeNS(xns, 'href').replace('v=%version', 'v=' + addon.version));

	
	//define the developers, contributors and translators as defined 
	//or hide each empty gridbox if no members are defined for it
	['developers','contributors','translators'].forEach(function(key)
	{
		var gridrows = document.getElementById('dms-about-' + key);
		if(addon[key])
		{
			for(var i in addon[key])
			{
				if(addon[key].hasOwnProperty(i))
				{
					var row = document.createElement('row');
					var label = row.appendChild(document.createElement('label'));
					
					var member = addon[key][i].name.split(/(?:\s*;\s*)/);
					if(member.length > 1)
					{
						label.setAttributeNS(xns, 'xlink:href', member[1]);
					}
					label.appendChild(document.createTextNode(member[0]));
					
					gridrows.appendChild(row);
				}
			}
		}
		if(gridrows.childElementCount == 0)
		{
			document.documentElement.removeChild(gridrows.parentNode.parentNode);
		}
	});
	
	//then resize the dialog to account for the new content
	window.sizeToContent();
	

	//now bind a general click event to open xlink hrefs in a new selected tab
	//nb. since this dialog is modal we have to close it first
	//but we can assume there's at least one browser window open
	//since you wouldn't be here viewing this page if there weren't
	document.addEventListener('click', function(e, href)
	{
		if(href = e.target.getAttributeNS(xns, 'href'))
		{
			window.addEventListener('unload', function()
			{ 
				var browser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
					.getService(Components.interfaces.nsIWindowMediator)
					.getMostRecentWindow("navigator:browser")
					.gBrowser;
				
				browser.selectedTab = browser.addTab(href);
			
			}, false);
			
			window.close();
		}
	}, false);

});	

