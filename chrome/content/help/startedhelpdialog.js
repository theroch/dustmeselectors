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


//when the window unloads
window.addEventListener('unload', function()
{
	
	//look for the most recently opened browser window, and if we find one 
	//and double-checking that it has the tools object, save the dialog properties
	var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser");
	if(win && win.DustMeSelectors_tools)
	{
		win.DustMeSelectors_tools.saveDialogProps(window, 'startedhelpdialog');
	}

}, false);



