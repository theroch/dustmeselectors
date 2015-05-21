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


//when the window loads
window.addEventListener('load', function()
{
	
	//save a shortcut to the help browser
	var browser = document.getElementById('dms-helpbrowser');
		

	//save a reference to the browser's content document
	var doc = browser.contentDocument;
	
	//copy the document title to this dialog's document title
	//nb. even though we now have separate dialogs for each help page
	//we'd still need to do this in case platform lang has changed the title
	//so we may as well keep the original setup of having a default help title
	//in the dialog which is always changed by this, so we can see it's working
	document.title = doc.title;
	
	//then get the collection of section headings in the document
	//and create a button inside each one, with its name set to 
	//the section ID and its text from the "dms:openin" attribute 
	//(which we use so the language can be defined in the help DTD)
	var headings = doc.getElementsByTagName('h2');
	for(var len = headings.length, i = 0; i < len; i ++)
	{
		var section = headings[i].parentNode;
		
		var button = doc.createElement('button');
		button.name = section.id;
		button.appendChild(doc.createTextNode(
			section.getAttributeNS('http://www.brothercake.com/dustmeselectors', 'openin')
			));
		
		headings[i].appendChild(button);
	}
	
	//now bind a general document click event to handle these buttons, 
	//which open the corresponding help page section in a normal firefox tab
	doc.addEventListener('click', function(e)
	{
		//if the target is a button (the only buttons on the page)
		if(e.target.nodeName.toLowerCase() == 'button') 
		{
			//compile the help page URL including the hash from the button's name
			//nb. remembering to remove any existing hash from the documentURI
			var url = doc.documentURI.split('#')[0] + '#' + e.target.name;
			
			//then look for the most recently opened browser window, 
			//which might be the preferences opener window, or if another 
			//window has since been opened and focused, it will be that one
			var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						.getService(Components.interfaces.nsIWindowMediator)
						.getMostRecentWindow("navigator:browser");
			
			//so if we find a window, open the URL 
			//in a selected tab in that window, then focus the window
			if(win)
			{
				win.gBrowser.selectedTab = win.gBrowser.addTab(url);
				win.focus();
			}
			
			//or if there are no open browser windows, 
			//open the URL in a new one (which is automatically focused)
			else
			{
				window.open(url);
			}
		}
	}, false);
	
	
	//now look for a "hash" value in query data, and if it's there,
	//and if the document doesn't already have the same location hash
	//update the browser's src to include the new hash
	//nb. the preferences help page uses these hashes so it can jump 
	//to the section that corresponds with the selected preferences tab
	if(location.search && location.search.indexOf('hash=') > -1)
	{
		var hash = '#' + location.search.split('hash=')[1];
		if(hash != doc.location.hash)
		{
			browser.setAttribute('src', browser.getAttribute('src').split('#')[0] + hash);
		}
	}
	

	//finally focus the browser, so you can use navigational keystrokes  
	//straight away without having to manually click or Tab into the browser 
	browser.focus();
			
			
}, false);


