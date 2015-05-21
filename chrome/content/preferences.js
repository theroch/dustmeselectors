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
this script is included by browser.xul, preferences.xul and spider.xul
however the dialogs are child windows of the main browser
so remember that each those instances expects a different window heirarchy
*/

//dust-me selectors preferences object
var DustMeSelectors_preferences = new Object();

//initialize the preferences service for our branch
DustMeSelectors_preferences.prefservice = Components.classes["@mozilla.org/preferences-service;1"]
	.getService(Components.interfaces['nsIPrefService'])
	.getBranch('extensions.dustmeselectors.');



//default accepted mime-types, for sitemaps we can read and pages we can scan
DustMeSelectors_preferences.mimetypes = {
	'sitemap' 	: 'text/html,application/xhtml+xml,text/xml,application/xml',
	'pages' 	: 'text/html,application/xhtml+xml'
	};
	
//default selector filter patterns, for parsing test selectors during evaluation
//nb. each of these strings defines a pattern for the RegExp constructor 
//to address selectors after they've been normalized by firefox's css parser
//eg. "*+html" would be "* + html" or "*:first-child" would be ":first-child"
//(though if you're not sure of the normalization you could go eg. "[\*]?:first-child")
//nb. most patterns replace to empty-string, however the "accountforhacks" pattern 
//replaces to "$1", which is "html" (or whatever's in the first capturing parentheses; 
// I did consider replacing to empty-string, but then what if that's the whole selector)
//nnb. all the generated regular expressions are greedy and insensitive :-O
//nnb. any escapes in the patterns must be defined with double-escapes
//(but only for strings defined here, not when you edit them in about:config)
//nb. none of the filter patterns include any structural pseudo-classes, 
//because they refer to content that can already be matched directly
//nnb. we only include pseudo-classes up to CSS3, I don't reckon it's worth 
//adding anything from CSS4 just yet, as they're too uncommon to be worth the expense
//apart from ":indetermindate" but only because that's mentioned in Selectors Level 3
//also the general pseudo-element pattern allows for values with parentheses eg "::slot()"
DustMeSelectors_preferences.selectorfilters = {
	
	//any simple element selector
	'ignoreelements'		: '^[a-z1-6]+$',
	
	//pseudo-classes that define dynamic and interface states, including negations 
	'ignorepseudostates'	: '(:not\\()?:(link|visited|hover|focus|active|target|(en|dis)abled|checked|indeterminate|\\-moz\\-placeholder)(\\))?',
	
	//single-colon syntax for legacy pseudo-elements, or double-colon syntax for anything else
	'ignorepseudoelements'	: '(:(first\\-(letter|line)|before|after))|(::[-a-z]+(\\([^\\)]*\\))?)',
	
	//"* html" or "* + html" or ":first-child + html" (normalized from "*:first-child + html")
	'accountforhacks'		: '^(?:[\\*] (?:[\\+] )?|:first\\-child [\\+] )(html)'
	};

//definitive list of user preferences and their defaults
DustMeSelectors_preferences.defaults = {
	
	//options that can be changed in the preferences dialog
	'showinstatus' 			: false,				//show dust-me icon in the add-on bar
	'showincontext' 		: true,					//show dust-me in the context-menu
	'showtoolbarlabel'		: true,					//show scanning data in the toolbar button
	'showtoolbarstarted'	: true,					//show "getting started" guide in the toolbar menu
	'precollapse' 			: false,				//pre-collapse selector groups in the view dialog
	'spiderpersist'			: true,					//persist the most recent value in the sitemap URL textbox
	'spidertitles'			: false,				//show page titles in the sitemap URL autocomplete menu
	'saveperhost' 			: true,					//save data for each host separately
	'ignoreports' 			: false,				//ignore port-number differences (ie. treat them all as the same site)
	'ignoresubdomains'		: false,				//ignore sub-domain differences (ie. treat them as the same site)
	'clearconfirm' 			: true,					//confirm before trashing data for a site
	'nospiderjs' 			: false,				//disable javascript for the spider
	'verifyhead' 			: true,					//verify sitemap pages using HEAD requests
	'noexternal' 			: true,					//don't spider external links
	'nofollow' 				: true,					//don't spider links by attribute match
	'relattr'				: 'rel',				//=> filter attribute (eg. "rel")
	'relcondition' 			: 'contains',			//=> filter condition ("contains", "notcontains")
	'relvalues' 			: 'external,nofollow',	//=> filter value(s) (one or more comma-delimited attr values)
	'styleblocks'			: false,				//process internal stylesheets 
	'ignoreelements' 		: true,					//don't test simple element selectors
	'ignorepseudostates' 	: true,					//treat all dynamic and UI pseudo-states as default
	'ignorepseudoelements' 	: true,					//treat all pseudo-elements as default
	'accountforhacks' 		: true,					//account for common CSS hacks 
	'autorun' 				: false,				//scan pages automatically while browsing
	'mutation' 				: true,					//scan again if content is added to the <body>
	'mutationhead' 			: false, 				//scan again if content is added to the <head>
	'mutationattrs' 		: false,				//scan again if any attributes change
	'mutationignoreattrs'	: 'style,alt,title,value,src',	//names of attribute mutations to ignore (one or more comma-delimited attr names)
	'autorunrestrict' 		: false,				//only scan specific sites (defined via editable tree view)
	'openafterautorun' 		: false,				//view selectors after autorun
	'notifyafterautorun' 	: true,					//show a popup notification after autorun
	'notifyboxafterautorun' : false,				//show the notification box after autorun
	'openafterfind' 		: true,					//view selectors after manual find
	'notifyafterfind' 		: true,					//show a popup notification after manual find
	'notifyboxafterfind' 	: false,				//show the notification box after manual find
	'openafterspider' 		: true,					//view selectors after spider
	'notifyafterspider' 	: true,					//show a popup notification after spider
	'notifyboxafterspider' 	: false,				//show the notification box after spider
	'boxpriority'			: 'info',				//notification bar message priority ("info", "warning", "critical")
	'usepreffolder' 		: true,					//save data in my profile folder
	'specifyfolder' 		: false,				//use this folder ...
	'datafolder' 			: '',					//(selected folder path)
	'deleteonquit'			: false,
	
	//options that can only be changed in about:config
	//nb. this doesn't include values created by tools.saveDialogProps
	'version' 				: '',					//version number preference [set by browser chrome load process]
	'chunksize' 			: 50,					//APU chunksize
	'apuspeed' 				: 10,					//APU timer speed (ms)
	'queryscopeid'			: 'dustmeselectorscope',//dyanmic element ID for scoped selector queries
	'sheetpointer'			: 'stylesheet',			//pointer fragment for storing stylesheet owner information in its group URL
	'cleanedfilename'		: '%s-cleaned.css',		//default filename pattern for cleaned stylesheets (replaces existing extension, eg "style.php" becomes "style-cleaned.css")
	'cleanedcommentstart'	: '/**',				//opening comment for cleaned selectors and rules 
	'cleanedcommentend'		: '**/',				//closing comment for cleaned selectors and rules 
	'mutationbuffer'		: 100,					//buffer speed for mutation callbacks (ms)
	'mapurl'				: '',					//spider mapurl persistence value (none by default)
	'havequitobserver'		: false					//whether we have an active quit observer
	};





//preferences dialog loaded
DustMeSelectors_preferences.preferencesDialogLoaded = function()
{
	//update any windows-specific language, which we can 
	//identify by the "winnt-lang" class on each affected element
	//then a "dms:winnt-foo" attribute that stores the windows language
	//ie. dms:winnt-label would replace the default label attribute
	//nb. doing it this way rather than applying stringbundle values 
	//means that the language can all be defined in the same DTD and XML
	if(opener.DustMeSelectors_tools.platform == 'winnt')
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
	

	//for each of the preference widgets, get the associated preference
	//and then modify the value as applicable
	var widget;
	for(var i in this.defaults)
	{
		if(!this.defaults.hasOwnProperty(i)) { continue; }

		//checkboxes
		if(widget = document.getElementById('dms-preference-' + i))
		{
			widget.setAttribute('checked', this.getPreference('boolean', i));
			this.handleCheckboxChange(widget);
			continue;
		}

		//radio buttons
		if(widget = document.getElementById('dms-preference-radio-' + i))
		{
			widget.setAttribute('selected', this.getPreference('boolean', i));
			this.handleRadioChange(widget);
			continue;
		}

		//textboxes (including editable menulists, which automatically 
		// select the menu item corresponding with the value, if it's there)
		//nb. we don't need to pre-filter in case the current value is invalid
		//as that will happen when it's actually used, or if you edit it
		if(widget = document.getElementById('dms-preference-text-' + i))
		{
			widget.setAttribute('value', this.getPreference('string', i));
			continue;
		}
		
		//standard menulists
		if(widget = document.getElementById('dms-preference-menu-' + i))
		{
			var menuitems = widget.getElementsByTagName('menuitem');
			var pref = this.getPreference('string', i);
			for(var j = 0; j < menuitems.length; j ++)
			{
				if(menuitems[j].getAttribute('value') == pref)
				{
					widget.selectedItem = menuitems[j];
					break;
				}
			}
			continue;
		}
	}
	
	
	//bind an input listener to inputs that define attr names or values
	//to fold the value to lower-case and/or filter invalid characters
	//nb. we have to remember the cursor position before any change
	//so we can put it back to the same position afterwards 
	//(adjusted to compensate for the number of lost characters)
	//otherwise it will jump to the end whenever we change the value
	//nnb. for the menulist the input comes from its inputField object
	//so we can use the presence of that to know what reference to get
	for(var ids = ['relattr','relvalues','mutationignoreattrs'], i = 0; i < ids.length; i ++)
	{
		document.getElementById('dms-preference-text-' + ids[i]).addEventListener('input', function(e)
		{
			var field = e.target.inputField || e.target;
			var cursor = field.selectionStart;
			
			if(/[A-Z]/.test(field.value))
			{
				field.value = field.value.toLowerCase();
				field.selectionStart = field.selectionEnd = cursor;
			}
			if(/([^-,\w])/.test(field.value))
			{
				var length = field.value.length;
				field.value = field.value.replace(/([^-,\w])/g, '');
				field.selectionStart = field.selectionEnd = (cursor - (length - field.value.length));
			}
		
		}, false);
	}
	
	
	//initialize the autorunhosts tree 
	DustMeSelectors_preferences.initializeTree();
	
	
	
	/***DEV (autoshow the autorunhosts panel, and check the options its appearance implies) ***//*
	document.getElementById('dms-preftabs').selectedIndex = 2;
	setTimeout(function()
	{
		document.getElementById('dms-preference-autorun').checked = true;
		DustMeSelectors_preferences.handleCheckboxChange(document.getElementById('dms-preference-autorun'));
		document.getElementById('dms-preference-autorunrestrict').checked = true;
		DustMeSelectors_preferences.handleCheckboxChange(document.getElementById('dms-preference-autorunrestrict'));
		setTimeout(function()
		{
			document.getElementById('dms-prefpanel-autorunhosts').openPopup(document.getElementById('dms-prefbutton-autorunhosts'), 'after_start');
		},100);
	},100);
	*/
	
	
};




//initialize the autorunhosts tree 
DustMeSelectors_preferences.initializeTree = function()
{
	//save global and local references to the tree and treechildren	
	var tree = this.tree = document.getElementById('dms-preftree-autorunhosts');
	var treechildren = this.treechildren = tree.getElementsByTagName('treechildren').item(0);

	
	//save a local reference to the autorunhosts array
	//(which the opener window stored when the chrome loaded)
	var autorunhosts = opener.DustMeSelectors_browser.autorunhosts;
	
	//then use that data to generate the default tree content
	//(which will of course produce no data if there isn't any)
	for(var len = autorunhosts.length, i = 0; i < len; i ++)
	{
		//create the treeitem row
		var hostitem = document.createElement('treeitem');
		var row = hostitem.appendChild(document.createElement('treerow'));
		
		//create the "active" check cell with the corresponding checked value
		var activecell = row.appendChild(document.createElement('treecell'));
		activecell.setAttribute('value', autorunhosts[i].active);
		
		//create the "host" text cell with the corresponding host name
		//and also defining the checked value as a "properties" attribute 
		//(which is the only way of applying custom state-depdenent CSS)
		//nb. convert any port-number hashes back into colons for display and editing
		var hostcell = row.appendChild(document.createElement('treecell'));
		hostcell.setAttribute('label', autorunhosts[i].host.replace(/[#]/g, ':'));
		hostcell.setAttribute('properties', autorunhosts[i].active);
		
		//then append the created item to the treechildren
		treechildren.appendChild(hostitem);
	}
	

	//when the tree receives keyboard focus and has no existing selection
	//select the first item automatically, else there's no visual indication
	//nb. but we have to filter this using a keydown flag so that we
	//don't affect mouse selection, which also generates a focus event
	//(ie. when checking or unchecking a host with the mouse, we shouldn't make a selection,
	// otherwise we'd have to do that for every checking and unchecking action)
	//nb. we also have to scroll the selection into view, in case 
	//eg. you just deleted an item at the end of the list (which reset the selection) 
	//then tabbed back into the list again (which selects the topmost item)
	var keydown = false;
	document.addEventListener('keydown', function(){ keydown = true; }, false);
	document.addEventListener('keyup', function(){ keydown = false; }, false);
	tree.addEventListener('focus', function(e)
	{
		if(keydown === true && DustMeSelectors_preferences.getSelectedTreeIndexes().length == 0) 
		{ 
			DustMeSelectors_preferences.selectTreeIntoView(0);
		}
	}, false);
	
	
	//automatically re-sort the tree when hosts are edited
	//nb. there is a sort-service for programatic tree sorting 
	//but, like the treecol "sort" attribute, it's bollocks
	//ie. it doesn't sort the tree into any coherent order
	//nb. this is done from onblur so that it's also triggered 
	//when you accept changes by selecting a different item
	//whereas a keypress trigger would only work by pressing enter
	//but this means we also need a focus listener, to maintain
	//a flag of the index of the row that's being edited
	//(however that will come in useful later anyway)
	var editindex = -1;
	tree.inputField.addEventListener('focus', function(e)
	{
		editindex = tree.editingRow;
		
		//nb. disable the delete button while the edit field is visible
		//because if you click "add" and then click "delete" straight away
		//the new item is deleted but the edit field is stuck visible 
		//and triggers a tree view error; the button will then be enabled 
		//again by the selection event that's triggered after editing
		document.getElementById('dms-prefpanel-deletebutton').disabled = true;

	}, false);					
	tree.inputField.addEventListener('blur', function(e)
	{
		//nb. we have to pause or we'll break the edit functionality
		setTimeout(function()
		{
			//get the treeitems, then create an array of 
			//host objects, where each lists the hostname 
			//from the text cell label, the treeitem reference, 
			//the text cell reference, and the original row index
			var hosts = [];
			var treeitems = treechildren.getElementsByTagName('treeitem');
			for(var i = 0; i < treeitems.length; i ++)
			{
				var treecell = treeitems[i].getElementsByTagName('treecell').item(1);
				hosts.push(
				{ 
					host 		: treecell.getAttribute('label'), 
					treeitem 	: treeitems[i],
					treecell 	: treecell,
					index 		: i 
				});
			}
			
			
			//trim the edited host value and remove any protocol or "www." prefix
			//converting the value to lowercase, because the documents hosts
			//we compare these with will always be normalized to lowercase
			//nb. at this point the editindex is still the hosts array index we want
			hosts[editindex].host = 
				hosts[editindex].host.toLowerCase()
					.replace(/^\s+|\s+$/g, '')
					.replace(/^([a-z]+[:]+[\/]+)/i, '')
					.replace(/^(www\.)/i, '');
			
			//split and remove any path information, then filter out any 
			//remaining invalid characters, and replace any contiguous dots 
			//with single dots, then remove any leading or trailing dot
			//nb. we don't need to check that the value actually is a valid host,
			//only that it has the pattern of something that could be a host,
			//then we compare it against the document host when autorun status 
			//is tested, and if it's not a real host it will just never pass
			hosts[editindex].host = 
				hosts[editindex].host
					.split('/')[0]
					.replace(/[^-:\.\w]/g, '')
					.replace(/[\.]+/g, '.')
					.replace(/(^[\.]|[\.]$)/, '');
			
			//split the host by any contiguous groups of colons it contains, 
			//and if the last bit is purely numeric then it's a valid port number,
			//unless it's 80 which we should remove like firefox does automatically,
			//but otherwise add a single colon to the start, then rejoin the array 
			//by empty string, which effectively removes any invalid colons
			//then if the value is now nothing but a port, delete it
			var b, hostbits = hosts[editindex].host.split(/[:]+/);
			if(/^[\d]+$/.test(hostbits[(b = hostbits.length - 1)]))
			{
				if(hostbits[b] == '80')	{ hostbits.pop(); }
				else 					{ hostbits[b] = ':' + hostbits[b]; }
			}
			if(/^[:][\d]+$/.test(hosts[editindex].host = hostbits.join('')))
			{
				hosts[editindex].host = '';
			}
			
			//then if the value is now empty
			if(hosts[editindex].host == '')
			{
				//remove the item we just created
				treechildren.removeChild(hosts[editindex].treeitem);
				
				//get the row index before the one that was just selected
				//limiting to zero in case we just edited the first one
				var preindex = (preindex = editindex - 1) < 0 ? 0 : preindex;
				
				//then sroll that row into view
				DustMeSelectors_preferences.selectTreeIntoView(preindex);
			}
			
			//else the value is okay
			else
			{
				//write the updated host value back to the treecell label 
				hosts[editindex].treecell.setAttribute('label', hosts[editindex].host);
				
				//now sort the array by the host names
				hosts.sort(function(a,b)
				{
					var x = a.host.toLowerCase(), y = b.host.toLowerCase();
	
					return x < y ? -1 : x > y ? 1 : 0;
				});
				
				//then apply the sort to the tree
				for(var len = hosts.length, i = 0; i < len; i ++)
				{
					treechildren.appendChild(hosts[i].treeitem);
				}
				
				//then find and re-select the original edit row
				//nb. which we have to do in a separate iteration
				//because the indices won't be stable during the sort
				for(var i = 0; i < len; i ++)
				{
					if(hosts[i].index == editindex)
					{
						//select and scroll the row back into view
						DustMeSelectors_preferences.selectTreeIntoView(i);
	
						//(there's only one)
						break;
					}
				}
				
				//then enabled the delete button, which won't become
				//enabled by the select event when editindex > -1
				document.getElementById('dms-prefpanel-deletebutton').disabled = false;
			}
			
			//and finally reset the editindex either way
			editindex = -1;
			
		},10);

	}, false);

	
	//implement keyboard-based editing triggered by the enter key
	//nb. this effectively blocks the dialog accept action
	//but only when the focus is actually inside the tree
	//nb. but we must make sure we're not already editing 
	//or we'll end up duplicating the item that was just edited
	//and for this we can use the editindex flag we already have
	tree.addEventListener('keypress', function(e)
	{
		//if this is the enter key and we're not already editing
		if(editindex < 0 && e.keyCode == KeyEvent.DOM_VK_RETURN)
		{
			//get the tree selection indices
			var indexes = DustMeSelectors_preferences.getSelectedTreeIndexes();
			
			//then only proceed if we only have exactly one selection
			//because it's not possible to edit more than one at once
			//nb. but still block the default action so the dialog doesn't close
			if(indexes.length == 1)
			{
				//start editing the host cell
				//nb. no need to scroll into view because it already will be
				tree.startEditing(indexes[0], tree.columns[1]);
			}
			
			//block the default action
			e.preventDefault();
		}						
	}, false);
	
	
	//implement keyboard-based un/checking triggered by the space bar
	//and selection deleting triggered by the backspace or delete key
	//nb. we must also make sure we're not editing so we don't block user typing
	tree.addEventListener('keydown', function(e)
	{
		//if this is the space bar, backspace or delete key
		//and we're not already editing
		if(editindex < 0
			&& (e.keyCode == KeyEvent.DOM_VK_SPACE 
				|| e.keyCode == KeyEvent.DOM_VK_BACK_SPACE 
				|| e.keyCode == KeyEvent.DOM_VK_DELETE))
		{
			//get the tree selection indices
			var indexes = DustMeSelectors_preferences.getSelectedTreeIndexes();
			
			//then only proceed if we have selections
			if(indexes.length > 0)
			{
				//if this is the space bar we want to invert the item(s) checked state
				//nb. if there's more than one selection then invert them all
				if(e.keyCode == KeyEvent.DOM_VK_SPACE)
				{
					//get the treeitems, then create an array of references to the 
					//cells inside each item that corresponds with a selection index
					var treecells = [];
					var treeitems = treechildren.getElementsByTagName('treeitem');
					for(var i = 0; i < indexes.length; i ++)
					{
						treecells.push(treeitems[indexes[i]].getElementsByTagName('treecell'));
					}
					
					//then iterate through the cells and invert each "value"
					//also setting the text cell "properties" attribute to match
					for(var i = 0; i < treecells.length; i ++)
					{
						treecells[i].item(0).setAttribute('value', 
							(treecells[i].item(0).getAttribute('value') != 'true'));
						treecells[i].item(1).setAttribute('properties', 
							treecells[i].item(0).getAttribute('value'));
					}
				}
				
				//else it must be the backspace or delete key
				//so we want to delete the selected items
				else
				{
					//so do that 
					DustMeSelectors_preferences.deleteSelectedTreeHosts();
					
					//get the row index before the one that was just selected
					//limiting to zero in case we just deleted the first one
					var preindex = (preindex = indexes[0] - 1) < 0 ? 0 : preindex;
					
					//then sroll that row into view
					DustMeSelectors_preferences.selectTreeIntoView(preindex);
				}
			
				//block the default action
				e.preventDefault();
			}
		}
	}, false);
	
	
	//then implement a response event for mouse-based un/checking 
	//so we can update the text cell "properties" attribute to match
	//nb. this isn't so simple to do because the returned event target
	//is always the treechildren element, irrespective of what was clicked
	//and we can't use the selection data we use for the keyboard,
	//since clicking a checkcell doesn't (and shouldn't) select the row
	tree.addEventListener('mousedown', function(e)
	{
		//so first get the target cell from the mouse co-ordinates
  		var row = {}, col = {}, child = {};
  		tree.boxObject.getCellAt(e.clientX, e.clientY, row, col, child);
  		
  		//then if the target is a "cell" (rather than "text")
  		if(child.value == 'cell')
  		{
  			//get the cell value and apply it to the 
  			//properties attribute of the corresponding text cell
			treechildren.getElementsByTagName('treeitem').item(row.value)
				.getElementsByTagName('treecell').item(1)
				.setAttribute('properties', tree.view.getCellValue(row.value, col.value));
  		}
  
	}, false);	
	
	
	//bind a tree select event to enable and disable the delete button
	//nb. afaik the only time apart from default that tree can only be unselected
	//is just after a row was deleted since we select rows when they're edited or sorted
	//nb. don't allow the button to become enabled if the input field is not visible 
	//(see inputField focus listener for notes on why that's a problem)
	tree.addEventListener('select', function(e)
	{
		document.getElementById('dms-prefpanel-deletebutton').disabled = 
			(DustMeSelectors_preferences.getSelectedTreeIndexes().length == 0 || editindex >= 0);
	
	}, false);
	
	
};
	
	
//abstraction for compiling the selected row indices from the view range(s)
DustMeSelectors_preferences.getSelectedTreeIndexes = function()
{
	//the ranges still show a single member even when 
	//the tree is empty, so we have to double-check the 
	//treeitem elements, and return an empty array if there aren't any
	if(DustMeSelectors_preferences.treechildren.getElementsByTagName('treeitem').length == 0)
	{
		return [];
	}
	
	//else compile and return an array from the active ranges
	var indexes = [];
	var start = {};
	var end = {};
	for(var len = DustMeSelectors_preferences.tree.view.selection.getRangeCount(), i = 0; i < len; i ++)
	{
		DustMeSelectors_preferences.tree.view.selection.getRangeAt(i, start, end);
		for(var v = start.value; v <= end.value; v ++)
		{
			indexes.push(v);
		}
	}
	return indexes;
}
	
	
//abstraction for selecting a row by index and scrolling it into view
//nb. the ensureRowIsVisible function works much better than scrollToRow
//because that tries to scroll the row so it's at the top of the view 
//which is often far more scrolling than is really necessary 
//and if it's the very last item it screws up the scrollbar rendering 
DustMeSelectors_preferences.selectTreeIntoView = function(rowindex)
{
	DustMeSelectors_preferences.tree.view.selection.select(rowindex); 
	
	DustMeSelectors_preferences.tree.boxObject.QueryInterface(Components.interfaces.nsITreeBoxObject);
	DustMeSelectors_preferences.tree.boxObject.ensureRowIsVisible(rowindex);
}
	

//add a new host to the tree
DustMeSelectors_preferences.addTreeHost = function()
{
	//create a new tree item with the necessary treerow 
	//and treecells, then append it to the treechildren 
	var hostitem = document.createElement('treeitem');
	var row = hostitem.appendChild(document.createElement('treerow'));
	var activecell = row.appendChild(document.createElement('treecell'));
	activecell.setAttribute('value', 'true');
	var hostcell = row.appendChild(document.createElement('treecell'));
	hostcell.setAttribute('label', '');
	DustMeSelectors_preferences.treechildren.appendChild(hostitem);
	
	//get the row index of [what's now] the last row
	var lastindex = (DustMeSelectors_preferences.tree.getElementsByTagName('treeitem').length - 1);
	
	//select the row and scroll it into view
	DustMeSelectors_preferences.selectTreeIntoView(lastindex);
	
	//then start editing the host column
	DustMeSelectors_preferences.tree.startEditing(lastindex, DustMeSelectors_preferences.tree.columns[1]);
}
					

//delete one or more selected hosts from the tree
DustMeSelectors_preferences.deleteSelectedTreeHosts = function()
{
	//get the tree selection indices
	var deadindexes = DustMeSelectors_preferences.getSelectedTreeIndexes();
	
	//get a collection of corresponding treeitem references 
	//nb. we have to do this first instead of removing 
	//then with the deadindexes, because the row indexes
	//will change each time we remove one of them
	var deaditems = [];
	var treeitems = DustMeSelectors_preferences.treechildren.getElementsByTagName('treeitem');
	for(var i = 0; i < treeitems.length; i ++)
	{
		if(i == deadindexes[0])
		{
			deaditems.push(treeitems[i]);
			deadindexes.shift();
		}
	}
	
	//now remove all the items 
	//nb. there's obviously no need to re-sort the tree 
	//because removing items doesn't change the order
	while(deaditems.length > 0)
	{
		DustMeSelectors_preferences.treechildren.removeChild(deaditems.shift());
	}
	
	//then re-disable the button
	document.getElementById('dms-prefpanel-deletebutton').disabled = true;
}




//handle the change event on a specific checkbox, to implement co-dependencies
DustMeSelectors_preferences.handleCheckboxChange = function(checkbox)
{
	//is this checkbox checked?
	var ischecked = checkbox.getAttribute('checked') == 'true' ? true : false;

	//switch by checkbox which has a co-dependency
	switch(checkbox.id.replace('dms-preference-', ''))
	{
		case 'saveperhost' :
		case 'autorun' :

			//get the collection of related checkboxes in the next sibling box
			//then iterate through them and set them enabled or disabled accordingly
			var options = checkbox.nextSibling.getElementsByTagName('checkbox');
			for(var i=0; i<options.length; i++)
			{
				options[i].disabled = !ischecked;

				//enable or disable the authohosts button
				//according to the combined state of autorun and autorunrestrict
				if(options[i].id == 'dms-preference-autorunrestrict')
				{
					document.getElementById('dms-prefbutton-autorunhosts').disabled = (!ischecked || !options[i].checked);
				}
				//enable or disable the mutationignoreattrs textbox
				//according to the combined state of autorun and mutationattrs
				if(options[i].id == 'dms-preference-mutationattrs')
				{
					document.getElementById('dms-preference-text-mutationignoreattrs').disabled = (!ischecked || !options[i].checked);
				}
			}
			break;

		case 'mutationattrs' : 

			//enable or disable the mutationignoreattrs textbox
			//according to the combined state of autorun and mutationattrs
			document.getElementById('dms-preference-text-mutationignoreattrs').disabled = (!ischecked || !document.getElementById('dms-preference-autorun').checked);
			break;

		case 'autorunrestrict' : 
		
			//enable or disable the autorunhosts button 
			//according to the combined state of autorun and autorunrestrict
			document.getElementById('dms-prefbutton-autorunhosts').disabled = (!ischecked || !document.getElementById('dms-preference-autorun').checked);
			break;
			
		case 'nofollow' : 
		
			//disable the rel-condition menu, the rel-attr list 
			//and rel-values textbox if this is not checked
			document.getElementById('dms-preference-text-relattr').disabled = !ischecked;
			document.getElementById('dms-preference-menu-relcondition').disabled = !ischecked;
			document.getElementById('dms-preference-text-relvalues').disabled = !ischecked;
			break;
			
		case 'deleteonquit' :
		
			//show the warning icon when this is enabled
			document.getElementById('dms-preficon-deletewarning').setAttribute('hidden', !ischecked);
			
			break;
	}
};



//handle the change event on a specific radio, to implement co-dependencies
DustMeSelectors_preferences.handleRadioChange = function(radio)
{
	//is this radio selected?
	var isselected = radio.getAttribute('selected') == 'true' ? true : false;

	//switch by radio
	switch(radio.id.replace('dms-preference-radio-', ''))
	{
		//use preferences folder
		case 'usepreffolder' :

			//disable the folder textbox and browse button if this is selected
			document.getElementById('dms-preference-text-datafolder').disabled = isselected;
			document.getElementById('dms-prefbutton-browse').disabled = isselected;

			break;

		//specify folder folder
		case 'specifyfolder' :

			//disable the folder textbox and browse button if this is not selected
			document.getElementById('dms-preference-text-datafolder').disabled = !isselected;
			document.getElementById('dms-prefbutton-browse').disabled = !isselected;

			break;
	}
};



//choose a data folder
DustMeSelectors_preferences.chooseDataFolder = function()
{
	//create a folder picker interface
	var nsIFilePicker = Components.interfaces.nsIFilePicker;
	var filepointer = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	filepointer.init(window, '', nsIFilePicker.modeGetFolder);

	//then show the dialog, and if we get a successful result 
	//from that (ie, a folder has been named or selected)
	if(filepointer.show() != nsIFilePicker.returnCancel)
	{
		//write it to the text field
		document.getElementById('dms-preference-text-datafolder').setAttribute('value', filepointer.file.path);
	}
};



//accept preferences changes
DustMeSelectors_preferences.acceptChanges = function()
{
	//get all the active checkboxes and radios in the dialog
	//then itereate through them and save each of their values to preference
	var widgets = ['checkbox', 'radio'], attrs = ['checked', 'selected'];
	for(var n=0; n<widgets.length; n++)
	{
		var elements = document.getElementsByTagName(widgets[n]);
		for(var i=0; i<elements.length; i++)
		{
			if(elements[i].id == '') { continue; }
			this.setPreference('boolean',
				elements[i].id.replace(/(dms\-preference\-(radio\-)?)/, ''),
				elements[i].getAttribute(attrs[n]) == 'true' ? true : false);
		}
	}
	
	
	//save the selected value of the relcondition menu, and the value of the 
	//relattr list and relvalues textbox, reducing or removing commas as applicable
	//nb. since we filter relvalues and relattr input live, there's no need to 
	//parse again, even if it's an empty string it will return its default when used
	//nb. even though you can specify the attribute name now, the preferences
	//are still called "relfoo" because it's just not worth changing them 
	this.setPreference('string', 'relcondition', 
		document.getElementById('dms-preference-menu-relcondition')
			.selectedItem.getAttribute('value'));
	this.setPreference('string', 'relvalues', 
		document.getElementById('dms-preference-text-relvalues')
			.value.replace(/[,]+/g, ',').replace(/[,]$/, ''));
	this.setPreference('string', 'relattr', 
		document.getElementById('dms-preference-text-relattr')
			.value.replace(/[,]/g, ''));
		
	//save the value of the mutationignoreattrs textbox, reducing commas
	this.setPreference('string', 'mutationignoreattrs', 
		document.getElementById('dms-preference-text-mutationignoreattrs')
			.value.replace(/[,]+/g, ',').replace(/[,]$/, ''));
	
	
	//save the selected value of the boxpriority menu
	this.setPreference('string', 'boxpriority', 
		document.getElementById('dms-preference-menu-boxpriority')
			.selectedItem.getAttribute('value'));
	
	
	//temporarily save the current datafolder preference
	var currentfolder = this.getPreference('string', 'datafolder');

	//if specifyfolder is selected and the value of the datafolder textbox 
	//is not empty, set the path to the folder in preferences
	var datafolder = document.getElementById('dms-preference-text-datafolder').getAttribute('value');
	if(datafolder != '' && document.getElementById('dms-preference-radio-specifyfolder').getAttribute('selected'))
	{
		this.setPreference('string', 'datafolder', datafolder);
	}
	//else (if it wasn't selected or the datafolder was empty)
	//set an empty string for the datafolder and reset the folder preferences
	else
	{
		this.setPreference('string', 'datafolder', '');
		this.setPreference('boolean', 'usepreffolder', true);
		this.setPreference('boolean', 'specifyfolder', false);
	}
	
	//now re-initialise the data saving options to update the filesystem datapath
	DustMeSelectors_tools.initialiseDataSavingOptions();
		
	//then compile the data from the autorunhosts tree into an array of objects
	//nb. convert any port-number colon into the hash we use in prefnames
	var treedata = [];
	var treeitems = this.treechildren.getElementsByTagName('treeitem');
	for(var i = 0; i < treeitems.length; i ++)
	{
		var treecells = treeitems[i].getElementsByTagName('treecell');
		treedata.push(
		{ 
			host 	: treecells.item(1).getAttribute('label').replace(/[:]/g, '#'),
			active	: treecells.item(0).getAttribute('value') == 'true'
		});
	}

	//then save it as a JSON string to the autorunhosts file
	//nb. we do this whether or not autorun is enabled 
	//in case you edit it then disable autorun in the same dialog session
	//but we couldn't do it until now in case the datafolder changed
	//nb. but since we do it every time with the data that's in the tree now 
	//this means that we effectively carry-over autorunhosts data from one 
	//folder to the next, rather than having a different set for each data folder
	//** I think that's the right behavior, or would it be better not to do that?
	DustMeSelectors_filesystem.dumpToFile('autorunhosts.json', DustMeSelectors_tools.Object_toJSONString(treedata));


	//run the rest of the window management functions in the opener window
	//setting autorun without updating the preference, just reflecting it
	//(otherwise the update function would simply invert the current state)
	opener.DustMeSelectors_browser.doSetAutorunPreference(false);
	opener.DustMeSelectors_tools.initialiseDataSavingOptions();
	opener.DustMeSelectors_browser.updateControlSettings(opener.window.content.document.location);
	
	//hide or show the status overlay according to preference
	opener.DustMeSelectors_browser.setUIState('statusoverlay',
		!document.getElementById('dms-preference-showinstatus').checked);

	//hide or show the context-menu according to preference
	opener.DustMeSelectors_browser.setUIState('contextmenu',
		!document.getElementById('dms-preference-showincontext').checked);
		
	//if the toolbar button is present, show or hide the toolbar menu 
	//"getting started" item and separator according to the showtoolbarstarted preference
	if(opener.document.getElementById('dms-toolbarbutton'))
	{
		var showtoolbarstarted = this.getPreference('boolean', 'showtoolbarstarted');
		opener.document.getElementById('dms-toolbarpopup-started-separator').setAttribute('hidden', !showtoolbarstarted);
		opener.document.getElementById('dms-toolbarpopup-started').setAttribute('hidden', !showtoolbarstarted);
	}

	//if the viewdialog is open, run its open method again 
	//to update its host menu and the current data view 
	//nb. we have to force the selectors tab, and corresponding user-focus,
	//because this function assumes that the selectors tab is selected
	if(opener.DustMeSelectors_browser.viewdialog && !opener.DustMeSelectors_browser.viewdialog.closed)
	{
		opener.DustMeSelectors_browser.viewSavedSelectors(null, true, true);
	}
};



//open the preference help dialog, and set its 
//location hash to correspond with the selected tab
DustMeSelectors_preferences.openHelp = function(hash)
{
	//get the hash defined by the selected tab's dms:help attribute
	//nb. the attribute values must match the pattern of a valid ID 
	//so that it's not necessary to encode them when passing in query data
	var hash = document.getElementById('dms-preftabs').selectedItem
				.getAttributeNS('http://www.brothercake.com/dustmeselectors', 'help');

	//then if we already have an open preference help dialog
	if(this.preferenceshelpdialog && !this.preferenceshelpdialog.closed)
	{
		//re-open the preferences help dialog, passing the hash as a query parameter
		//nb. we have to do this so that the helpdialog window load event will fire again
		//because that's what we use to update the location hash with the new value
		//NOTE FOR REVIEWERS: the query value will never contain a remote URI
		this.preferenceshelpdialog = window.openDialog(
			'chrome://dustmeselectors/content/help/preferenceshelpdialog.xul?hash=' + hash,
			'preferenceshelpdialog', 'width=445,height=490,resizable=yes,dialog=no');
		
		//focus the window
		this.preferenceshelpdialog.focus();
	}
	
	//else we have to open a new one
	else
	{
		//open the preferences help dialog, passing the hash as a query parameter
		//nb. the specified size translates to pref 445x512 [on the mac]
		//(and presumably the difference is the height of the title bar)
		//NOTE FOR REVIEWERS: the query value will never contain a remote URI
		this.preferenceshelpdialog = window.openDialog(
			'chrome://dustmeselectors/content/help/preferenceshelpdialog.xul?hash=' + hash,
			'preferenceshelpdialog', 'width=445,height=490,resizable=yes,dialog=no');
		
		//apply any saved dialog properties 
		DustMeSelectors_tools.applyDialogProps(this.preferenceshelpdialog, 'preferenceshelpdialog');
		
		//then focus the window (just in case it's already open, 
		//but the triggering window is not its opener window)
		this.preferenceshelpdialog.focus();
	}
};




//get a preference value, or return the default if the preference
//isn't defined, or a fallback value if no applicable default exists
//nb. the prefservice throws an exception if the specified preference 
//has no defined user value, hence we need exception handling to read it
DustMeSelectors_preferences.getPreference = function(preftype, prefname)
{
	//define the preference type methods
	var prefmethods = 
	{
		'boolean'	: 'getBoolPref',
		'string'	: 'getCharPref',
		'number'	: 'getIntPref'
	};

	//if we have a default for this preference, remember that
	//otherwise set a generic default based on type
	//(all of which are falsy values)
	if(typeof this.defaults[prefname] != 'undefined')
	{
		var def = this.defaults[prefname];
	}
	else
	{
		switch(preftype)
		{
			case 'string'	: def = ''; 	break;
			case 'boolean'	: def = false; 	break;
			case 'number'	: def = 0; 		break;
		}
	}
	
	
	//nb. documentation says that the pref methods no longer 
	//throw an exception for non-existent preferences, they simply do nothing
	//testing DOES NOT confirm this, but nevertheless for safety
	//add a pref-has-value test in advance of this condition 
	//to set a default if the pref is undefined
	//and then to re-save it if it's a known default
	if(!this.prefservice.prefHasUserValue(prefname))
	{
		var pref = def;
		if(pref === this.defaults[prefname])
		{
			this.setPreference(preftype, prefname, pref);
		}
	}
	

	//else try to get the preference, or if we catch any exception
	//or the user value is empty string, use the default
	try
	{
		var pref = this.prefservice[prefmethods[preftype]](prefname);
		if(pref === '') 
		{ 
			pref = def; 
		}
	}
	catch(ex)
	{
		pref = def;
	}
	
	//then if the preference is [now] a known default, re-save it
	//nb. it's not strictly necessary to do this since we'll just 
	//keep returning the default, but it makes about:config more helpful
	if(pref === this.defaults[prefname])
	{
		this.setPreference(preftype, prefname, pref);
	}
	

	//return the preference value
	return pref;
};


//set a preference value by type
DustMeSelectors_preferences.setPreference = function(preftype, prefname, prefvalue)
{
	var prefmethods = 
	{
		'boolean'	: 'setBoolPref',
		'string'	: 'setCharPref',
		'number'	: 'setIntPref'
	};

	//nb. use exception handling here in case a non-string preference 
	//has been reset by the user to a string value (which can happen, 
	// probably because we're not declaring defaults in the usual way)
	try
	{
		this.prefservice[prefmethods[preftype]](prefname, prefvalue);
	}
	//then if we catch an error, delete the preference then try again
	//which will remove the string value and set the type we want
	catch(ex)
	{
		this.prefservice.clearUserPref(prefname);
		this.prefservice[prefmethods[preftype]](prefname, prefvalue);
	}
};



//check the preferences for selector filter patterns
//to create and return a dictionary of corresponding RegExp objects
//or set to null each one for which the preference is not enabled
//setting defaults for each preference that's not defined along the way
DustMeSelectors_preferences.getSelectorFilters = function()
{
	var selectorfilters = {};
	for(var key in DustMeSelectors_preferences.selectorfilters)
	{
		if(DustMeSelectors_preferences.selectorfilters.hasOwnProperty(key))
		{
			if(DustMeSelectors_preferences.getPreference('string', 'selectorfilters.' + key) == '')
			{
				DustMeSelectors_preferences.setPreference
					('string', 'selectorfilters.' + key, DustMeSelectors_preferences.selectorfilters[key]);
			}
			
			if(DustMeSelectors_preferences.getPreference('boolean', key))
			{
				//we need exception handling here in case the user has re-defined 
				//the pattern to something that fails regex compilation, 
				//in which case we'll just have to reset and re-save the default
				//** how can we indicate to the user that this has happened?
				//** perhaps a special message somewhere in the view data
				try
				{
					selectorfilters[key] = 
						new RegExp(DustMeSelectors_preferences.getPreference('string', 'selectorfilters.' + key), 'ig');
				}
				catch(ex)
				{
					selectorfilters[key] = 
						new RegExp(DustMeSelectors_preferences.selectorfilters[key], 'ig');

					DustMeSelectors_preferences.setPreference
						('string', 'selectorfilters.' + key, DustMeSelectors_preferences.selectorfilters[key]);
				}
			}
			else
			{
				selectorfilters[key] = null;
			}
		}
	}
	
	//return the finished object
	return selectorfilters;
};




