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


//dust-me selectors object
var DustMeSelectors = new Object();

//define a flag that indicates whether a find or spider process
//is currently running; since the browser and spider both load 
//this file independently, that means two separate flags 
DustMeSelectors.running = false;



//when the chrome has loaded
window.addEventListener('load', function()
{
	
	//instantiate dom utilities, which we use for getting the line number of CSS rules
	//that we can then show in selector views, and which is critical for the cleaning function
	DustMeSelectors.domutils = Components.classes["@mozilla.org/inspector/dom-utils;1"]
		.getService(Components.interfaces['inIDOMUtils']);

}, false);




//get all the selectors in all the stylesheets on the page we're viewing
DustMeSelectors.getAllSelectors = function(prefname, doc)
{
	//***DEV TMP
	//try { window.content.console.log('getAllSelectors(prefname="'+prefname+'", doc="'+doc.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'")'); } 
	//catch(ex) { opener.window.content.console.log('getAllSelectors(prefname="'+prefname+'", doc="'+doc.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'")'); }	

	//retrieve any saved selectors for this host, or create a new object
	var selectors = DustMeSelectors_tools.getDataObject(prefname, 'selectors', {});
	
	//iterate through the selectors and delete any style blocks whose URL groupkey 
	//(after removing any owner pointer hash) matches this documentURI 
	//(after removing any location hash), which we do so that we don't list
	//the same stylesheets again just because its position in the DOM has changed 
	//and since style blocks, by definition, can only apply to this page, we can 
	//delete the ones we have, safe in the knowledge that they'll all be parsed again
	//nb. originally we didn't support internal style blocks because of the inability 
	//to cross-reference them between pages (because how can you know that a given 
	//style block is the same one you saw before?), until it became clear that we 
	//don't have to, since their rules can only ever apply to the page they're on
	//nb. we do this whether or not the styleblocks preference is enabled, so that  
	//if it was enabled when this site was last scanned, but now it's disabled, 
	//then any existing style blocks in the dataset will be deleted
	for(var i in selectors)
	{
		if(!selectors.hasOwnProperty(i) || typeof selectors[i] == 'string') { continue; }
		
		if(decodeURIComponent(i).split('#')[0] == doc.documentURI.split('#')[0])
		{
			//***DEV
			//try { window.content.console.log('\u20e0 Delete internal stylesheet data "' + decodeURIComponent(i).replace(/.*\//g, '') + '"'); }
			//catch(ex) { opener.window.content.console.log('\u20e0 Delete internal stylesheet data "' + decodeURIComponent(i).replace(/.*\//g, '') + '"'); }
	
			delete selectors[i];
		}
	}


	//save a global reference to the context document
	DustMeSelectors.document = doc;
	
	//save the pointer fragment we used for storing stylesheet owner information
	//in its group URL, parsing out any non-alpha characters and re-saving in case it's been edited
	if(/[^a-z]/i.test(DustMeSelectors.sheetpointer = DustMeSelectors_preferences.getPreference('string', 'sheetpointer')))
	{
		DustMeSelectors_preferences.setPreference('string', 'sheetpointer', DustMeSelectors.sheetpointer.replace(/[^a-z]/gi, ''))
	}
	
	//create a global array with the stylesheets collection we're using
	//which initially reflects only the page's document.styleSheets collection
	//but we'll also add to it later if we find imports or conditional stylesheets 
	DustMeSelectors.stylesheets = [];
	for(var sheets=doc.styleSheets, l=sheets.length, i=0; i<l; i++)
	{
		DustMeSelectors.stylesheets.push(doc.styleSheets[i]);

		//***DEV
		//if(doc.styleSheets[i].href !== null)
		//{
		//	try { window.content.console.log('\u2192 Ordinary stylesheet "'+doc.styleSheets[i].href.replace(/.*\//g, '')+'" on page "'+doc.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
		//	catch(ex) { opener.window.content.console.log('\u2192 Ordinary stylesheet "'+doc.styleSheets[i].href.replace(/.*\//g, '')+'" on page "'+doc.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
		//}
	}
	
	//#	//preliminary scoped style support
	//#	DustMeSelectors.sheetscopes = {};

	//then asynchronously look for conditional stylesheets, and add any we find
	//onto the end of the global stylesheets collection; the iterator will then 
	//come round to them as normal, holding for loading/parsing as necessary
	DustMeSelectors.addConditionalStylesheets(selectors);


	//check the preferences for selector filter patterns
	//and save the returned dictionary of corresponding RegExp objects
	//or of null values for each one whose preference is not enabled
	//setting defaults for each preference that's not defined along the way
	DustMeSelectors.selectorfilters = DustMeSelectors_preferences.getSelectorFilters();
	
	//get the styleblocks preference and save it to a global property
	DustMeSelectors.styleblocks = DustMeSelectors_preferences.getPreference('boolean', 'styleblocks');


	//get the APU speed and chunksize from preferences, limiting 
	//and resaving the values if necessary, and then assigning 
	//to the tools properties which the APU actually uses
	DustMeSelectors_tools.apuspeedCreate();
	DustMeSelectors_tools.chunksizeCreate();
	
	//start a processor to manage stylesheets iteration 
	//using a chunksize of 1 so that each iteration has its own timer
	//(because the inner iteration through .cssRules is not APU controlled, 
	// and it also helps give enough time for any conditional stylesheets to load)
	var processor = new DustMeSelectors_tools.APU2(1, 

	//stylesheets processor => oninstance
	function(sheetindex)
	{
		//define a local abstraction for calling next or finish as applicable
		//just to save repeating the same code several times
		function proceed()
		{
			//if the running flag is still true
			if(DustMeSelectors.running)
			{
				//if we still have more stylesheets to check, 
				//call and return next() with a normal increment and fast timeout 
				//nb. we must check the length property each time, not save it, 
				//because we'll be adding to the array as we go along, so it will change
				if(sheetindex < (DustMeSelectors.stylesheets.length - 1))
				{
					return processor.next();
				}

				//else if we've checked them all, call and return complete()
				return processor.complete();
			}

			//else call and return abort()
			return processor.abort();
		}
		

		//if there are no stylesheets on this page, go directly to complete()
		if(DustMeSelectors.stylesheets.length == 0)
		{
			return processor.complete();
		}

		//check that the stylesheet reference itself is not null
		//if it is, that will be because it's a duplicate stylesheet 
		//that firefox has nullified to prevent infinite recursion 
		if(DustMeSelectors.stylesheets[sheetindex] === null)
		{
			//so we have nothing to do here; we can't even list an error, 
			//because we have nothing to index it with; so just proceed
			return proceed();
		}

		//try to save a reference to this stylesheet's cssRules collection
		//but wrap it in exception handling -- because if we try to read the 
		//rules collection of a stylesheet that hasn't fully loaded/parsed
		//we get a CSS DOM error (code 15 invalid access error)
		//so we're using the existence of the problem to fix the problem!
		//if the error is thrown then don't increment the counter, 
		//just wait a short time, then recur and check it again;
		//then once we can get the rules, we know the stylesheet is ready
		try
		{
			//so try to save the rules collection for this stylesheet
			var rules = DustMeSelectors.stylesheets[sheetindex].cssRules;

			//and if we're still here then the stylesheet is ready
			
			//if we have a spider object, reset its indicator 
			if(typeof DustMeSelectors_spider != 'undefined')
			{
				DustMeSelectors_spider.setUIState('loadingurl', false);
			}

			//then pass the stylesheet to the getSelectors method
			//and save what it returns back to the selectors object
			selectors = DustMeSelectors.getSelectors(selectors, DustMeSelectors.stylesheets[sheetindex], sheetindex);
			
			//then if the stylesheet had 1 or more rules, we're done with it
			//so call and return next or finish to proceed
			if(rules.length > 0)
			{
				return proceed();
			}			

			//but if it had no rules at all, we need to check its status 
			//to see if it's just empty, or if it's a 404 or whatever 
			//nb. the status function will also handle if the href is null
			DustMeSelectors.getStylesheetStatus(selectors, DustMeSelectors.stylesheets[sheetindex].href, 
			function(returnselectors)
			{
				//save the returned selectors object back to the selectors object
				selectors = returnselectors;
			
				//call next or finish to proceed
				return proceed();
			});
		}
		
		//but if we catch an error 
		catch(ex)
		{
			//if we catch that DOM error, call next with a zero increment and wrapped 
			//in a slow-ish timeout, so that the next iteration will check the same stylesheet again; 
			//and this condition will keep coming round for as long as the rules are unavailable. 
			//nb. we slow down the timeout here so that if we're waiting for a remote stylesheet 
			//we don't do loads of pointless fast testing; however if we're not waiting for a 
			//remote stylesheet, just the parsing of a local one, we still end up here
			//so we don't want the speed so slow that we're waiting needlessly too long!
			//although the fact that we wait slightly longer for, say, the first stylesheet,
			//means that the second stylesheet may well have had enough time to be ready by then;
			//nb. I had to change how this error is identified because its name has been 
			//changed from "NS_ERROR_DOM_INVALID_ACCESS_ERR" to "InvalidAccessError" 
			//exception codes are defined in the DOM standard, but exception names aren't, 
			//so the lesson here is to use codes not names to identify specific exceptions
			//(except that not all exceptions have a code! seems to depend on which 
			// interface they come from, so if we get one that doesn't then this condition 
			// won't pass (as code is undefined) and we'll end up logging a general exception)
			if(ex.code == 15)
			{
				//if we have a spider object, set its indicator back to loading
				if(typeof DustMeSelectors_spider != 'undefined')
				{
					DustMeSelectors_spider.setUIState('loadingurl', true);
				}
				
				//call and return next in a short timeout, as noted above
				//* the apu is supposed to be able to handle timing variations, but it 
				//* just kept iterating with no timeout and resulted in infinite recursion
				//* so until I have more time to look at that, this manual timeout will do
				return setTimeout(function(){ processor.next(0); }, 200);
			}
			
			//else if we catch any other error and we have a stylesheet href 
			//log it by that href, listing the error code, file-name and line-number for debug reference,
			//nb. remembering to URI encode the href just like all selectors indices 
			//but if we don't have an href, we can't log it, so that's that I guess!
			//nb. there's no known predictable situation where this will happen, its jic 
			//and provides information about the error to include with the spider log
			else
			{
				var loghref = DustMeSelectors.stylesheets[sheetindex].href;
				if(loghref !== null)
				{
					selectors[encodeURIComponent(loghref)] =
						DustMeSelectors_tools.bundle.getString('view.error')
							.replace('%1', (
								ex.name + (ex.code ? (' (' + ex.code + ')') : '')
								+ ' in ' + (ex.filename || ex.fileName || '').replace(/.*\//, '') 
								+ ' @ ' + ex.lineNumber
								));
				}
				
				//either way, call next or finish to proceed
				return proceed();
			}
		}
	},

	//stylesheets processor => oncomplete
	function()
	{
		//run through the document stylesheets collection, and remove any that we created
		//for testing conditional rules; which we can identify by their "__dustmeselectors" flag
		for(var len = DustMeSelectors.stylesheets.length, i = 0; i < len; i ++)
		{
			var sheet = DustMeSelectors.stylesheets[i];
			if(sheet !== null && typeof sheet.__dustmeselectors != 'undefined')
			{
				sheet.ownerNode.parentNode.removeChild(sheet.ownerNode);
			}
		}

		//if the running flag is still true
		if(DustMeSelectors.running)
		{
			//***DEV
			//var hrefs = [];
			//for(var len = DustMeSelectors.stylesheets.length, i = 0; i < len; i ++)
			//{
			//	hrefs.push(DustMeSelectors.stylesheets[i].href);
			//}
			//window.open('data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(hrefs)));
		
			//pass the finished selectors object to evaluate selectors
			DustMeSelectors.evaluateSelectors(selectors, prefname);
		}	
	},
	
	//stylesheets processor => onabort
	function()
	{
		//run through the document stylesheets collection, and remove any that we created
		//for testing conditional rules; which we can identify by their "__dustmeselectors" flag
		//nb. we have to do this onabort otherwise they'd all be added to the 
		//stylesheets array twice if you scan the same page again without refreshing
		//(or three time if you do that again ... and so on; you get the picture!)
		for(var len = DustMeSelectors.stylesheets.length, i = 0; i < len; i ++)
		{
			var sheet = DustMeSelectors.stylesheets[i];
			if(sheet !== null && typeof sheet.__dustmeselectors != 'undefined')
			{
				sheet.ownerNode.parentNode.removeChild(sheet.ownerNode);
			}
		}
	});

	//now start() the stylesheets processor
	return processor.start();
	
};



//look for stylesheets inside IE conditional comments, and for any new ones we find,
//create a normal [disabled] stylesheet include for it, at the end of the head section, 
//then add its styleSheet reference to the global stylesheets collection, 
//so the sheets-iterator can parse it like normal when it comes round
DustMeSelectors.addConditionalStylesheets = function(selectors)
{
	//get a reference to the document's head, then check that we actually 
	//have one in case it's not an HTML page, in which case we can't do this
	//(but then if it's not an HTML page it's unlikely to have conditional comments!)
	var head = DustMeSelectors.document.querySelector('head');
	if(!head) 
	{ 
		return; 
	}
	
	//define some regex patterns for parsing conditional stylesheets
	var patterns = 
	{
		//=> for matching and extracting the content of a conditional comment
		//nb. this pattern only allows for one conditional comment per comment
		//(but I should say that's a pretty safe assumption really :-))
		//nb. the nodeValue of a comment doesn't include the comment markers themseleves 
		//nb. the content will end up in [1] with everything else discarded
		conditional	: /(?:\[\s*if\s+(?:(?:\!\s*)?(?:[\(]\s*)?(?:[ltge]+\s+)?(?:IE|WindowsEdition|mso|true|false)(?:\s*[a-f\d\.]+\s*)?(?:[\)]\s*)?[\|\&]?\s*)+\]>)((?:\s|.)+)(?:\s*<\!\[\s*endif\s*\]\s*)/im,
		
		//=> for matching one or more <link> includes within the content 
		//of a conditional comment, and extracting their "href" values
		//nb. this pattern allows for any number of includes in one comment
		//but it won't identify hrefs if they're not wrapped in quotes
		//nb. the hrefs will end up in [1] with everything else discarded
		linkhrefs	: /(?:<link(?:[\s]|(?:[-\w]+\s*=\s*[\"\'][^\"\']+[\"\'])*)+)(?:href\s*=\s*[\"\'])([^\"\']+)(?:[\"\'][^>]*>)/gim,
		
		//=> for matching one or more <style> blocks within the content 
		//of a conditional comment, and extracting their css text
		//nb. this pattern allows for any number of blocks in one comment
		//it will also allow for the presence of markup samples in CSS comments
		//as long as they don't contain a closing-tag that starts with s eg. "</strike>"
		//(we could even allow for them, but that would be getting a bit ridiculous!)
		//nb. the inner text will end up in [1] with everything else discarded
		styletext	: /(?:<style[^>]*>)((?:[^<]|(?:<[^\/])|(?:<\/[^s]))+)(?:<\/style>)/gim
	};
	
	//define an object for storing all the match arrays we find
	//which will be an object of arrays indexed with the pattern keys
	var matches = 
	{
		conditional	: [],
		linkhrefs	: [],
		styletext	: []
	};
	
	
	//now iterate through the child nodes in the head section
	for(var len = head.childNodes.length, i = 0; i < len; i ++)
	{
		//save a shortcut to this node 
		var node = head.childNodes[i];

		//if the node is a comment and its text matches the conditional pattern
		//nb. using regex exec() rather than test() so we get a matches array
		//which will save us having to do another parse to extract the content
		if(node.nodeType == node.COMMENT_NODE 
			&& 
			(matches.conditional = patterns.conditional.exec(node.nodeValue)))
		{
			//***DEV
			//var str = '==================================================================\n';
			//str += matches.conditional[1];
			
			//use the linkhrefs pattern to look for <link> stylesheets in the content
			//then extract the trimmed "href" from any we find to its matches array
			//but we'll have to make sure that it's actually a stylesheet 
			//and not some other kind of link which also has an href
			matches.conditional[1].replace(patterns.linkhrefs, function(all, href)
			{
				if(/(rel\s*=\s*[\'\"]?\s*(alternate\s+)?stylesheet\s*)/im.test(all))
				{
					matches.linkhrefs.push(href.replace(/^\s+|\s+$/g, ''));
				}
			});
			
			//***DEV
			//if(matches.linkhrefs.length > 0)
			//{
			//	str += '\n##################################################################\n';
			//	str += matches.linkhrefs.join('\n******************************************************************\n');
			//	str += '\n##################################################################\n';
			//}

			//then for any matches we found
			while(matches.linkhrefs.length > 0)
			{
				//qualify the href into a complete URL
				//nb. we don't need to pass the document reference for base
				//because the qualify method retrieves that itself
				var url = DustMeSelectors_tools.qualifyHREF(matches.linkhrefs.shift());
				
				//***DEV
				//try { window.content.console.log('\u2192 Conditional stylesheet "'+url.replace(/.*\//g, '')+'" on page "'+node.ownerDocument.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
				//catch(ex) { opener.window.content.console.log('\u2192 Conditional stylesheet "'+url.replace(/.*\//g, '')+'" on page "'+node.ownerDocument.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }

				//then ignoring any that are already listed in the selectors object
				//since they won't get checked again, so it's pointless creating their includes again
				if(typeof selectors[encodeURIComponent(url)] == 'undefined')
				{
					//create a new link stylesheet element in the document we're checking, 
					//appended to the head, and with its href set to this new stylesheet url
					//then add the stylesheet reference to the end of the global collection
					//** ideally we'd insert it at its cascade position, relative to the other stylesheets,
					//** but that's quite a lot of extra fiddling about, for not enough benefit!
					DustMeSelectors.stylesheets.push(DustMeSelectors.createConditionalStylesheet(head, url));
				}
			}
			
			//now use the styletext pattern to look for <style> stylesheets in the content
			//then extract the css text from any non-empty ones we find to its matches array
			//but the match might be only white-space so we have to check for that
			matches.conditional[1].replace(patterns.styletext, function(all, csstext)
			{
				if(/\S/.test(csstext))
				{
					matches.styletext.push(csstext);
				}
			});
			
			//***DEV
			//if(matches.styletext.length > 0)
			//{
			//	str += '\n$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$\n';
			//	str += matches.styletext.join('\n++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++\n');
			//	str += '\n$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$';
			//}

			//then for any matches we found
			while(matches.styletext.length > 0)
			{
				//create a new style block in the document we're checking, appended to the head
				//then add the stylesheet reference to the end of the global collection
				//** ideally we'd insert it at its cascade position, relative to the other stylesheets,
				//** but that's quite a lot of extra fiddling about, for not enough benefit!
				//nb. we need to do this even if the styleblocks preference is disabled 
				//because we'll need to run through its rules to looks for @imports 
				//but we don't need to worry about duplication, because selectors data from 
				//style blocks on a given page is always deleted before re-scanning that page
				DustMeSelectors.stylesheets.push(DustMeSelectors.createConditionalStylesheet(head, null, matches.styletext.shift()));
			}

			//***DEV
			//str += '\n==================================================================';
			//try { window.content.console.log(str); } 
			//catch(ex) { opener.window.content.console.log(str); }
		}
	}
};


//create a temporary disable stylesheet to implement rules from inside 
//conditional comments, either as a <link> with the href pointing to a 
//specified URL, or as a <style> element with the specified css text
DustMeSelectors.createConditionalStylesheet = function(head, url, csstext)
{
	//if the url is not null (for a <link> stylesheet)
	if(url !== null)
	{
		//create a new link stylesheet element in the document we're checking, 
		//appended to the head, and with its href set to this new stylesheet url
		//nb. create the attributes before appending so that it doesn't trigger 
		//more than a single element mutation that's easy for us to filter out
		var owner = DustMeSelectors.document.createElement('link');
		owner.setAttribute('rel', 'stylesheet');
		owner.setAttribute('type', 'text/css');
		owner.setAttribute('href', url);
		head.appendChild(owner);
	}
	
	//else the csstext must be defined (for a <style> block)
	else	
	{
		//create a new link stylesheet element in the 
		//document we're checking, appended to the head
		//nb. create the attributes before appending so that it doesn't trigger 
		//more than a single element mutation that's easy for us to filter out
		var owner = DustMeSelectors.document.createElement('style');
		owner.setAttribute('type', 'text/css');
		owner.appendChild(DustMeSelectors.document.createTextNode(csstext));
		head.appendChild(owner);
	}
			
	//now get its stylesheet reference from the document stylesheets collection
	//you would think that, since we only just added it, it must be the last item
	//but in practise I've had that assumption fail! so we're going to iterate instead
	//and look for the stylesheet whose ownerNode matches the link element
	for(var sheets = DustMeSelectors.document.styleSheets, len = sheets.length, i = 0; i < len; i ++)
	{
		if(sheets[i].ownerNode === owner)
		{
			var sheet = sheets[i];
			break;
		}
	}
	
	//then immediately disable it, so its rules have no effect
	sheet.disabled = true; 
	
	//also set a special property to indicate that we created this stylesheet
	//so we know we can delete it again once its rules have been checked
	//and set it on the owner node as well so our mutation observers can ignore it
	sheet.__dustmeselectors = true;
	owner.__dustmeselectors = true;

	//then return the created styesheet reference 
	return sheet;
};




//get the CSS selectors from a single stylesheet 
//and/or add its imports to the stylesheets array for later checking
DustMeSelectors.getSelectors = function(selectors, stylesheet, sheetindex)
{
	//if this stylesheet is a <style> block then its href will be null
	//nb. using this instanceof rather than checking its nodeName 
	//avoids the need to check it against null first, which we 
	//otherwise would have to since imports have a null ownerNode
	if(stylesheet.ownerNode instanceof HTMLStyleElement)
	{
		//so if styleblocks is disabled, create a null index 
		//that we can recognise later to know not to save the 
		//stylesheet itself to the selectors object, while 
		//still iterating through its rules to look for imports
		if(!DustMeSelectors.styleblocks)
		{
			var index = null;
	
			//***DEV
			//try { window.content.console.log('\u2190 Don\'t parse internal stylesheet on page "'+stylesheet.ownerNode.ownerDocument.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
			//catch(ex) { opener.window.content.console.log('\u2190 Don\'t parse internal stylesheet on page "'+stylesheet.ownerNode.ownerDocument.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
		}
		
		//else we need to create a group index to be able to record this 
		//stylesheets data, so create one from the owner document URI plus
		//the owner node name and sheetindex, using xpointer-esque syntax
		//which is easy for us to parse-out later, and won't cause
		//any confusion because we remove any existing hash first
		//(consistent with what the spider does with all pages)
		//nb. the number is not important, it's just to make the key unique
		//and distinguishable from any other style elements on this page
		//nb. this syntax will also give us extensibility for the future, 
		//so we could eg. record the owner node name for every stylesheet
		else
		{
			index = encodeURIComponent(
					stylesheet.ownerNode.ownerDocument.documentURI
						.split('#')[0] + '#' + DustMeSelectors.sheetpointer + '(style[' + sheetindex + '])'
						);
	
			//#	//preliminary scoped style support
			//#	if(stylesheet.ownerNode.scoped)
			//#	{
			//#		DustMeSelectors.sheetscopes[index] = stylesheet.ownerNode.parentNode;
			//#	}
	
			//***DEV
			//try { window.content.console.log('\u2192 Internal stylesheet "'+decodeURIComponent(index).replace(/.*\//g, '')+'" on page "'+stylesheet.ownerNode.ownerDocument.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
			//catch(ex) { opener.window.content.console.log('\u2192 Internal stylesheet "'+decodeURIComponent(index).replace(/.*\//g, '')+'" on page "'+stylesheet.ownerNode.ownerDocument.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
		}
	}	

	//otherwise it's an @import or <link> or <?xml-stylesheet?> 
	//processing instruction, all of which have an href we can use
	else
	{
		//so get the stylesheet href, also removing any hash for consistency
		//(so the only hashes in stylesheet groupkeys will be our pointers)
		index = encodeURIComponent(stylesheet.href.split('#')[0]);
	}


	//then if index is null, or we don't already have selectors data for this index
	//nb. if we do then we don't load it again, you have to trash the data first
	//otherwise we'd be re-loading every stylesheet on every page, and then 
	//we'd never be able to accumulate more than one page of scanning data
	//(although we do do that for styleblocks when enabled, for the same reason!)
	if(index === null || typeof selectors[index] == 'undefined')
	{
		//if index is not null, create a new object with it
		if(index !== null) 
		{ 
			selectors[index] = {};
		
			//***DEV
			//try { window.content.console.log('\u21b3 Extracting selectors from "'+decodeURIComponent(index || 'NULL').replace(/.*\//g, '')+'" on page "'+(stylesheet.ownerNode ? stylesheet.ownerNode.ownerDocument.documentURI : 'NULL').replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
			//catch(ex) { opener.window.content.console.log('\u21b3 Extracting selectors from "'+decodeURIComponent(index || 'NULL').replace(/.*\//g, '')+'" on page "'+(stylesheet.ownerNode ? stylesheet.ownerNode.ownerDocument.documentURI : 'NULL').replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
		}
		
		//create a counter for numbering the properties
		//nb. for legacy reasons selectors[index] is an 
		//object with numbered properties, not an array
		//and the numbering is not necessarily contiguous
		var n = 0,
		
		//and a counter for numbering the imports we find, so we can 
		//add them to the global stylesheets array in cascade order
		//** though I'm not sure that's working out quite right
		m = 0,

		//then get the collection of rules for this stylesheet
		rules = stylesheet.cssRules;
		
		//iterate through the rules
		for(var l=rules.length, j=0; j<l; j++)
		{
			//save a shortcut to this rule
			var rule = rules.item(j);
			
			//if this is an @import rule
			//nb. we don't need to check it's in the right place
			//because it wouldn't appear in the stylesheet DOM if not
			if(rule.type == rule.IMPORT_RULE)
			{
				//try { window.content.console.log('\u2192 Imported stylesheet "'+rule.styleSheet.href.replace(/.*\//g, '')+'" on page "'+(stylesheet.ownerNode ? (stylesheet.ownerNode.ownerDocument ? stylesheet.ownerNode.ownerDocument.documentURI : 'DOM') : 'NULL').replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
				//catch(ex) { opener.window.content.console.log('\u2192 Imported stylesheet "'+rule.styleSheet.href.replace(/.*\//g, '')+'" on page "'+(stylesheet.ownerNode ? (stylesheet.ownerNode.ownerDocument ? stylesheet.ownerNode.ownerDocument.documentURI : 'DOM') : 'NULL').replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }

				//we simply need to add the stylesheet reference to the global collection
				//then the sheets-iterator APU will process it as normal when it comes round
				//but we're going to splice it into the array so it comes directly after 
				//its owner, rather than at the end; which is not strictly necessary, 
				//but I think it's more helpful for users to preserve the include order;
				//the splice index also needs to take account of the number of imports 
				//in this stylesheet, so we preserve that order as well, so we can 
				//add it to the splice index, then increment it ready for the next iteration
				DustMeSelectors.stylesheets.splice((sheetindex + (++m)), 0, rule.styleSheet);
			}
			
			//else if it's not an import when the index is null 
			//we don't want the rest of its rules (because styleblocks is disabled)
			else if(index === null) 
			{ 
				continue; 
			}
			
			//else if it's a normal style rule 
			else if(rule.type == rule.STYLE_RULE)
			{
				//parse the rule's selectorText and add it to the selectors object
				//or if the selector contained multiple comma-delimited selectors, 
				//then each selector will be added individually, so then we 
				//update the n counter to reflect the number of new additions 
				//using the value that was also passed to the parseSelectorText method
				//and is then returned having been incremented by the number of selectors
				var returndata = DustMeSelectors.parseSelectorText(rule, selectors[index], n);
				selectors[index] = returndata.selectors;
				n = returndata.n;
			}
			
			//else if it's an @media rule
			else if(rule.type == rule.MEDIA_RULE)
			{
				//define a local abstraction for iterating through its rules
				//so we can use it recursively in case of nested @media blocks
				function getBlockRules(blockrules)
				{
					//iterate through the rules collection 
					for(var bl=blockrules.length, b=0; b<bl; b++)
					{
						//save a shortcut to this rule
						var blockrule = blockrules.item(b);
						
						//if it's a style rule
						if(blockrule.type == blockrule.STYLE_RULE)
						{
							//parse the rule's selectorText and update selectors and n
							var returndata = DustMeSelectors.parseSelectorText(blockrule, selectors[index], n);
							selectors[index] = returndata.selectors;
							n = returndata.n;
						}
						
						//or if it's a nested @media rule
						else if(blockrule.type == blockrule.MEDIA_RULE)
						{
							//pass its rules collection back to this function
							getBlockRules(blockrule.cssRules);
						}
					}
				}
				
				//then pass the media block's rules collection to that function
				getBlockRules(rule.cssRules);
			}
		}
	
		//then if this is a styleblock, when the index isn't null, and we didn't find any style rules
		//(ie. it only contained @import, or only other @rules with no style rules)
		//we don't want to bloat the data view by listing it with neither unused nor used rules
		//so delete it from the selectors object (but we'll still have its imports)
		if(n === 0 && index !== null 
			&& 
			decodeURIComponent(index).indexOf('#' + DustMeSelectors.sheetpointer + '(style[') >= 0)
		{
			delete selectors[index];
		}
	}
	
	//return the [modified] selectors object
	return selectors;
};



//parse rule selector text for comma delimiters
//trim and add each individual selector to the selectors object
DustMeSelectors.parseSelectorText = function(rule, selectors, n)
{
	//***DEV (introduce semi-random parsing failures)
	//if(Math.random() * 10 < 1) { var selector = [DustMeSelectors_tools.bundle.getString('error.malformed')]; } else {
	
	//trim and trim-split the selector-text as necessary
	var selector = rule.selectorText.replace(/^\s+|\s+$/g, '').split(/\s*,\s*/g);

	//***DEV (semi-random parsing failures)
	//}
	
	//then and add each individual selector to the selectors group
	for(var n,l=selector.length, i=0; i<l; i++)
	{
		//***DEV (semi-random parsing failures)
		//if(selector[i] != DustMeSelectors_tools.bundle.getString('error.malformed')) {
		
		//add the line number, using a format that won't happen in CSS selector text, 
		//so we can parse it out later with no chance of accidentally editing the selector
		//also add the index of this selector relative to the rule, so that we can refer 
		//to and sort the data by those indices, which we'll need for the cleaning function
		var lineNumber = DustMeSelectors.domutils.getRuleLine(rule);
		var columnNumber = DustMeSelectors.domutils.getRuleColumn(rule);
		selector[i] += '{' + lineNumber + ':' + columnNumber + '.' + (i + 1) + '}';

		//***DEV (semi-random parsing failures)
		//}

		//add the final selector to the selectors group
		selectors[n++] = selector[i];
	}

	//return the selectors object and updated n counter
	return { selectors : selectors, n : n };
};



//check the status of a stylesheet that has no rules 
//to see if it's just empty, or if it returned a 404 or whatever 
//** can we get this information from firefox instead of having to make a network request?
DustMeSelectors.getStylesheetStatus = function(selectors, href, oncomplete)
{
	//if the href is null then there's nothing to check
	//so just pass the unchanged selectors object back through oncomplete
	if(href === null)
	{
		return oncomplete(selectors);
	}
	
	//else try to create a new XMLHttpRequest to load the stylesheet
	try
	{
		//***DEV
		//try { window.content.console.log('\u21c4 Verifying status of stylesheet "'+href.replace(/.*\//g, '')+'"'); }
		//catch(ex) { opener.window.content.console.log('\u21c4 Extracting selectors from "'+href.replace(/.*\//g, '')+'"'); }
		
		//instantiate the request
		var request = new XMLHttpRequest();

		//define a readystatechange function for completion
		request.onreadystatechange = function()
		{
			if(request.readyState == 4)
			{
				//if the request status is anything but 0, 200 or 304
				//then something is wrong with the stylesheet, it isn't just empty
				//so log that error in the selectors object using the statusText
				//nb. remembering to URI encode the href, as all selectors indices are
				//nb. code zero usually means a local XHR request, but it will only get this far 
				//if it instantiates okay -- a broken path will throw an error and get caught
				//so we're treating code zero as, the stylesheet is okay it's just empty;
				//however code zero will also happen if we try to request a remote stylesheet
				//when we have no net connection ... which is odd -- I thought that would 
				//throw an instantiation error; but anyway, since we can't differentiate 
				//we're just going to have to say that the stylesheet is empty
				//** or maybe just drop support for file:// and return "notavailable" for code 0
				if(!/^(0|200|304)$/.test(request.status.toString()))
				{
					selectors[encodeURIComponent(href)] = 
						DustMeSelectors_tools.bundle.getString('view.error')
							.replace('%1', request.status + ' ' + request.statusText);
				}
				
				//else the statusText will be empty if it's unavailable, 
				//hence we output the view error with the notfound info as part of the message
				//otherwise it wil just be listed as having no used or unused selectors
				else if(request.statusText == '') 
				{
					selectors[encodeURIComponent(href)] = 
						DustMeSelectors_tools.bundle.getString('view.error')
							.replace('%1', DustMeSelectors_tools.bundle.getString('error.notavailable'));
				}
				
				//now pass the selectors object back through oncomplete
				oncomplete(selectors);
			}
		}

		//open and send an asynchronous HEAD request for the stylesheet
		//nb. we only need to make a HEAD request because all we need 
		//is its status header, so no point wastefully getting its body text
		request.open('HEAD', href, true);
		request.send(null);

	}

	//if we fail to instantiate a request
	catch(ex)
	{
		//if the error is NS_ERROR_FILE_NOT_FOUND
		//then this will be a stylesheet with a broken file:// path
		//so log it in the selectors object as error.notavailable
		//otherwise just log it as a general connection failure
		//nb. remembering to URI encode the href, as all selectors indices are
		//nb. I tried to change this to identify by code instead of by name, same as at line 197,
		//but I don't know the code and am unable to trigger the error! so i've added an additional 
		//speculative condition using a naming convention extrapolated from the change at 197;
		//though given that I couldn't make it happen, it's probably not likely to happen to users either
		selectors[encodeURIComponent(href)] = DustMeSelectors_tools.bundle.getString('view.error')
			.replace('%1', DustMeSelectors_tools.bundle.getString(
				(ex.name.toString() == 'NS_ERROR_FILE_NOT_FOUND' || ex.name.toString() == 'FileNotFound')
				? 'error.notavailable'
				: 'error.noconnect'
				));

		//pass the selectors object back through oncomplete
		oncomplete(selectors);
	}
};


//evaluate the final object of CSS selectors
//to see if they correspond to present HTML
DustMeSelectors.evaluateSelectors = function(selectors, prefname)
{
	//***DEV
	//try { window.content.console.log('evaluateSelectors(selectors='+selectors+', prefname="'+prefname+'")'); } 
	//catch(ex) { opener.window.content.console.log('evaluateSelectors(selectors='+selectors+', prefname="'+prefname+'")'); }
	
	//we're going to pass each selector to querySelectorAll
	//using the APU abstraction, that works with asynchronous timers
	//to prevent the browser ever freezing up from the heavy activity
	//however we don't need to break it down so much that we only check 
	//one selector per iteration, we can do a fair few more than that each time
	//the number of selectors we can test per iteration is defined by the "chunksize"
	//and adding that is how we got the dramatic speed improvement in v3.0
	
	//get the object of used selectors, or create an empty object
	var used = DustMeSelectors_tools.getDataObject(prefname, 'used', {});

	//create an array of selector group keys, and add 
	//corresponding top-level groups to the used object, if undefined 
	//(which it will be for a new stylesheet the first time it's encountered)
	//we also need to record the highest index in each group, so that we know 
	//when we've checked them all, and we can't just increment the counter until 
	//we reach an item that's undefined, because the numbering of groups is not contiguous
	//nb. we used to just re-key them, but that was creating a problem where selectors 
	//would be over-written or duplicated because their key had changed
	var groupkeys = [], grouplimit = {};
	for(var i in selectors)
	{
		if(!selectors.hasOwnProperty(i) || typeof selectors[i] == 'string') { continue; }
		
		groupkeys.push(i);
		if(typeof used[i] == 'undefined') 
		{ 
			used[i] = {}; 
		}
		
		//get all the indices and sort them to get the highest one
		//or if the group is empty then the highest index is zero
		grouplimit[i] = [];
		for(var n in selectors[i])
		{
			if(selectors[i].hasOwnProperty(n))
			{
				grouplimit[i].push(parseInt(n, 10));
			}
		}
		grouplimit[i].sort(function(a,b)
		{ 
			return b - a; 
		});
		grouplimit[i] = (grouplimit[i].length == 0 ? 0 : grouplimit[i][0]); 
	}
	
	
	//save a reference to any existing error handler
	//so that we can bind our own handler without affecting existing ones
	//(see groups processor => oninstance for the handler itself)
	var oldonerror = window.onerror;


	//define a local save and output abstraction
	//since we have to do this twice in different places
	function jobdone()
	{
		//if we have a spider object, pass the selectors object 
		//back to the spider's save and continue function
		//otherwise save and output in the normal way
		if(typeof DustMeSelectors_spider != 'undefined')
		{
			DustMeSelectors_spider.saveAndContinue(selectors, used);
		}
		else 
		{ 
			DustMeSelectors_browser.saveAndOutput(selectors, used); 
		}
	}
	
	//then if we don't have any selector groups, go straight to save and output
	if(groupkeys.length == 0) 
	{ 
		return jobdone(); 
	}
	
	
	//get the APU speed and chunksize from preferences, limiting 
	//and resaving the values if necessary, and then assigning 
	//to the tools properties which the APU actually uses
	DustMeSelectors_tools.apuspeedCreate();
	DustMeSelectors_tools.chunksizeCreate();

	//create a counter for tracking the 
	//total number of unused selectors we've found
	//so we can pass the data back for status display 
	var foundunused = 0;

	//define a local display and continue abstraction
	function jobdisplay(found, among)
	{
		//if we have a spider object, update the spider status label
		//otherwise update the browser status label in the normal way
		if(typeof DustMeSelectors_spider != 'undefined')
		{
			DustMeSelectors_spider.updateStatusLabel(found, among);
		}
		else
		{
			DustMeSelectors_browser.updateStatusLabel(found, among);
		}
	}

	//define a local abstraction for increment the current index of a rule within a group
	//which we have to do because their numbering is not necessarily contiguous
	//but once the index value reaches, or has exceeded, the grouplimit (the group's highest index)
	//then we know that we've reached the end of this group (or it was empty)
	//so if that's the case we return -1, else we return the new index
	function increment(groupkey, index)
	{
		while(typeof selectors[groupkey][index] == 'undefined')
		{
			if(index >= grouplimit[groupkey])
			{
				return -1;
			}
			index++;
		}
		return index;
	}
	
	
	//create a dictionary for APU references
	var processors = {};
	
	//then create a processor for iterating through the groups
	//passing a chunksize of 1 so that each group has its own timeout
	//which reduces the possibility of "too much recursion" errors
	//that seem to be ultimately caused by doing too much work in one chunk
	//(which is why it only happened in virtual machines, not on my desktop, 
	// since the virtual machines have limited RAM and only 1 CPU core)
	processors.groups = new DustMeSelectors_tools.APU2(1, 
	
	//groups processor => oninstance
	function(key)
	{
		//*** DEV
		//window.content.console.log('groups processor => oninstance (key = ' + key + ')');
		
		//before proceeding we need to check that the test document is still valid 
		//which we do by trying to refer to its documentURI, which will fail if it's dead
		//and if it is, then call the applicable stop method, which will reset the UI and running flag
		//nb. the document can become dead if a page is refreshed or removed during a scan
		//(either manual page refresh on a normal scan, or pressing spider pause during a page scan)
		//and if we don't do this check then we'll get the "can't access dead object" error 
		//nnb. this will only catch page refreshes, not following links, but we don't need 
		//to do that because scanning can still continue in that case, and the original 
		//document reference appears to survive the change in context (though I'm not entirely sure why!)
		//(or if automation is enabled then the scan will be restarted when the new page loads)
		//nnb. the spider condition isn't strictly necessary, since you can't abandon a spider 
		//operation without pressing pause, but we may as well have it anyway for jic belt and braces
		try
		{
			var alive = DustMeSelectors.document.documentURI;
		}
		catch(dx)
		{
			if(typeof DustMeSelectors_spider != 'undefined')
			{
				DustMeSelectors_spider.stop();
			}
			else
			{
				DustMeSelectors_browser.stop();
			}

			//*** DEV
			//try { window.content.console.log('Aborted dead document ('+(typeof DustMeSelectors_spider != 'undefined'?'spider':'browser')+' groups processor)'); } 
			//catch(wx) { opener.window.content.console.log('Aborted dead document ('+(typeof DustMeSelectors_spider != 'undefined'?'spider':'browser')+' groups processor)'); } 
		}
		
		//then if the running flag is [now] false, call and return the groups processor abort() method
		if(!DustMeSelectors.running)
		{
			return processors.groups.abort();
		}
		
		
		//[else] get the group URL key for the current numeric key
		var groupkey = groupkeys[key];
		
		//but if we've now run out of groupkeys then we've processed every group
		//so call and return the groups processor complete() method, 
		//to do final save and output, and then we're done with this iteration
		if(typeof selectors[groupkey] == 'undefined')
		{
			return processors.groups.complete();
		}
		

		//define a custom error handler to trap any uncaught exception
		//just in case we still get that too much recursion error
		//NOTE FOR REVIEWERS: this global overwrite is only temporary 
		window.onerror = function()
		{
			//define an error message for this stylesheet
			selectors[groupkey] = 
				DustMeSelectors_tools.bundle.getString('view.error')
					.replace('%1', (
						(arguments[0] || '??')
						+ ' in ' + (arguments[1] || '??').replace(/.*\//, '') 
						+ ' @ ' + (arguments[2] || '??')
						));

			//then proceed to the next one
			processors.groups.next();
		};
	

		//now run through the global stylesheets array and compare each href 
		//with this groupkey, and if it's not listed then this stylesheet 
		//was added to the dataset on a different page, so even if the selectors 
		//it contains are used on this page, they're still unused selectors 
		//because the stylesheet they come from isn't included on this page
		//(sounds obvious I know, but we got to v4.0 before I realised!)
		//nb. we also have to allow for stylesheets with a null href, 
		//which will be <style> elements, and in that case they're included 
		//only if their groupkey (after removing any owner pointer hash) 
		//matches this documentURI (after removing any location hash)
		//nnb. but we don't need to consider that styleblocks is disabled 
		//because then there wouldn't be any applicable groupkeys 
		for(var included = false, len = DustMeSelectors.stylesheets.length, i = 0; i < len; i ++)
		{
			if((!DustMeSelectors.stylesheets[i].href
				&&
				decodeURIComponent(groupkey).split('#')[0] 
					== DustMeSelectors.document.documentURI.split('#')[0])
			||
			(DustMeSelectors.stylesheets[i].href
				&&
				groupkey
					== encodeURIComponent(DustMeSelectors.stylesheets[i].href)))
			{
				included = true;
				break;
			}
		}

		//so if it's not included, call and return the groups processor 
		//next() method, to ignore this stylesheet and move onto the next one
		if(!included)
		{
			//***DEV
			//try { window.content.console.log('\u2199 Ignoring selectors from "'+decodeURIComponent(groupkey).replace(/.*\//g, '')+'" on page "'+DustMeSelectors.document.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
			//catch(ex) { opener.window.content.console.log('\u2199 Ignoring selectors from "'+decodeURIComponent(groupkey).replace(/.*\//g, '')+'" on page "'+DustMeSelectors.document.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }

			return processors.groups.next();
		}
		

		//***DEV
		//try { window.content.console.log('\u21ba Processing selectors from "'+decodeURIComponent(groupkey).replace(/.*\//g, '')+'" on page "'+DustMeSelectors.document.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
		//catch(ex) { opener.window.content.console.log('\u21ba Processing selectors from "'+decodeURIComponent(groupkey).replace(/.*\//g, '')+'" on page "'+DustMeSelectors.document.documentURI.replace(/[\/]$/,'').replace(/.*\//g, '')+'"'); }
		
		//else create a processor for iterating through this group's rules
		//passing a chunksize of null so it uses the preference value
		processors.rules = new DustMeSelectors_tools.APU2(null, 
	
		//rules processor => oninstance
		function(ruleindex)
		{
			//*** DEV TMP
			//window.content.console.log('groups processor => oninstance (ruleindex = ' + ruleindex + ')');
			
			//check that the document is still valid to avoid dead object errors
			//and if it is, then call the applicable stop method, which will reset the UI and running flag
			try
			{
				var alive = DustMeSelectors.document.documentURI;
			}
			catch(dx)
			{
				if(typeof DustMeSelectors_spider != 'undefined')
				{
					DustMeSelectors_spider.stop();
				}
				else
				{
					DustMeSelectors_browser.stop();
				}
	
				//*** DEV
				//try { window.content.console.log('Aborted dead document ('+(typeof DustMeSelectors_spider != 'undefined'?'spider':'browser')+' rules processor)'); } 
				//catch(wx) { opener.window.content.console.log('Aborted dead document ('+(typeof DustMeSelectors_spider != 'undefined'?'spider':'browser')+' rules processor)'); } 
			}
			
			//then if the running flag is [now] false, call and return the rules processor abort() method
			if(!DustMeSelectors.running)
			{
				return processors.rules.abort();
			}
	
	
			//[else] save the original index that was passed in as an argument
			var rawindex = ruleindex;

			//re-increment the ruleindex until we find the next one in this group
			ruleindex = increment(groupkey, ruleindex);
			
			//but if that returns -1 then we've reached the end of this group
			//so call and return the rules processor complete() method 
			//to move onto the next one, and we're done with iteration
			if(ruleindex < 0)
			{
				return processors.rules.complete();
			}
			
			//we have to do this bit using try..catch in case of query selector exceptions 
			try
			{
				//delete any existing untestable message, so we try again every time
				selectors[groupkey][ruleindex] = selectors[groupkey][ruleindex]
					.replace(DustMeSelectors_tools.bundle.getString('error.unrecognised') + ' ', '');
	
				//and delete any legacy untestable message, from before we changed the prefix
				selectors[groupkey][ruleindex] = selectors[groupkey][ruleindex]
					.replace(/((Unsupported|Untestable) selector\: )/, '');
	
				//***DEV (introduce semi-random parsing failures)
				//if(Math.random() * 10 < 1) { throw('fake recognition error'); }
	

				//create a local copy of the selector
				//removing the line-number and selector-index data
				var testselector = selectors[groupkey][ruleindex].split('{')[0];
				
				//nb. the order of filters is not significant
				
				//***DEV
				//try { window.content.console.log('  Testing selector "'+testselector+'"'); }
				//catch(ex) { opener.window.content.console.log('  Testing selector "'+testselector+'"'); }
				
				//if accountforhacks is enabled then parse the selector with it
				//nb. the default pattern recognises "* html" or "* + html" 
				//or ":first-child + html", converting each of them to just "html"
				//nnb. all of these hacks are used to target versions of Internet Explorer
				//and wouldn't match anything in Firefox without this special parsing
				if(DustMeSelectors.selectorfilters.accountforhacks !== null)
				{
					testselector = testselector.replace(DustMeSelectors.selectorfilters.accountforhacks, '$1');
				}
				
				//if ignorepseudoelements is enabled then parse the selector with it
				//nb. the default pattern recognises single-colon syntax for 
				//legacy pseudo-elements, or double-colon syntax for anything else
				//the result will never be empty because of normalizeation
				//eg. "::selection" would have been normalized to "*::selection"
				if(DustMeSelectors.selectorfilters.ignorepseudoelements !== null)
				{
					testselector = testselector.replace(DustMeSelectors.selectorfilters.ignorepseudoelements, '');
				}
	
				//if ignorepseudostates is enabled then parse the selector with it
				//nb. the default pattern recognises a fixed set of dynamic states
				//including negations, but the pattern for that will also match
				//invalid partial variants such as ":hover)" or ":not(:hover", 
				//but that doesn't really matter since they wouldn't make it this far
				//(ie. firefox would reject them when it was parsing the css)
				if(DustMeSelectors.selectorfilters.ignorepseudostates !== null)
				{
					testselector = testselector.replace(DustMeSelectors.selectorfilters.ignorepseudostates, '');
				
					//if the selector is now empty then it must have been 
					//something like ":hover" which firefox doesn't normalize 
					//to "*:hover" (even though it does for eg. "::first-line")
					//so if that's the case then set it to "*" so it's testable
					//(which is what it means, so we're not changing the selector)
					if(testselector == '')
					{
						testselector = '*';
					}
				}						


				//#	//preliminary scoped style support
				//this won't work until firefox supports ":scope"
				//since selector queries otherwise evaluate on the whole document
				//even if they're limited to a specific element; consider:
				//	<body>
				//		<ul>
				//			<li id="scope"></li>
				//		</ul>
				//	</body>
				//scope.querySelector('body > ul') matches the list when it should be null
				//#	//var scope = DustMeSelectors.sheetscopes[groupkey] || DustMeSelectors.document;
				
				//now evaluate the test selector, and if it's being used on this page,
				//or it's a simple element selector and ignoreelements is enabled
				//nb. using querySelector should be faster than querySelectorAll
				if
				(
					DustMeSelectors.document.querySelector(testselector) !== null
					//#	//preliminary scoped style support
					//#	scope.querySelector(testselector) !== null
					||
					(
						DustMeSelectors.selectorfilters.ignoreelements !== null
						&&
						(testselector.replace(DustMeSelectors.selectorfilters.ignoreelements, '') == '')
					)
				)
				{
					//copy it across to the used selectors group
					used[groupkey][ruleindex] = selectors[groupkey][ruleindex];
					
					//and delete it from the selectors group
					delete selectors[groupkey][ruleindex];
				}
	
				//otherwise this rule is redundent
				else
				{
					//delete it from the used selectors object if it's listed there 
					//** don't think it can be -- a rule can't be 
					//** found unused again, once it's been found or marked used
					if(typeof used[groupkey][ruleindex] != 'undefined')
					{
						delete used[groupkey][ruleindex];
					}
	
					//increase the foundunused count for status display
					++foundunused;
				}
			}
			
			//or if we catch an exception then list the rule as unused
			catch(ex)
			{
				//increase the foundunused count for status display
				++ foundunused;
				
				//add a message to the selector to denote that it was untestable
				//nb. the message has to go at the beginning or it will 
				//always be removed again by the line-number token parsing
				selectors[groupkey][ruleindex] =  
					DustMeSelectors_tools.bundle.getString('error.unrecognised')
					+ ' ' + selectors[groupkey][ruleindex];
			}

			//then in either case
			finally
			{
				//display the results so far to the applicable status area
				jobdisplay(foundunused, key + 1);
				
				//increment the ruleindex by 1 chunk
				ruleindex ++;
			}
			
			//then call the rules processor next() method to move onto the next rule
			//incrementing it by the difference beteen ruleindex and rawindex 
			//so that the ruleindex passed to the next iteration has increased 
			//by the same amount as we increased the ruleindex on this iteration
			//nb. it would be the difference + 1, but we've gained a residual extra 1
			//from the "ruleindex ++" increment at the end of the final chunk loop
			//all of which mean the difference we pass includes those increments too
			return processors.rules.next(ruleindex - rawindex);
		},
	
		//rules processor => oncomplete 
		function(ruleindex)
		{
			//if the running flag is still true
			if(DustMeSelectors.running)
			{
				//display the results so far to the applicable status area
				jobdisplay(foundunused, key + 1);
				
				//call the groups processor next() method to move onto the next group
				return processors.groups.next();
			}
		},
		
		//rules processor => onabort
		function(ruleindex)
		{
			//call the return the groups processor abort() method
			return processors.groups.abort();
		});
		
		//now start() the rules processor
		return processors.rules.start();
	},
	
	//groups processor => oncomplete
	function(key)
	{
		//restore any previously-existing error handler
		//so that subequent errors are thrown as normal
		//NOTE FOR REVIEWERS: this restores the temporary global overwrite
		window.onerror = oldonerror;

		//if the running flag is still true
		if(DustMeSelectors.running)
		{
			//go to final save and output, and we're done
			return jobdone();
		}
	},
	
	//groups processor => onabort
	function(key)
	{
		//restore any previously-existing error handler
		//so that subequent errors are thrown as normal
		//NOTE FOR REVIEWERS: this restores the temporary global overwrite
		window.onerror = oldonerror;
	});
		
	//now start() the groups processor
	return processors.groups.start();
	
};





//add identifying markers around unusued selectors and rules, from a reference list 
//of unused selectors and the raw css text of the stylesheet they came from
//nb. as well as the stylesheet url and css text, and the list of selectors, 
//this function is passed a bunch of references to the viewdialog, the selectors 
//browser document, and to the referenced and generated elements currently inside it
DustMeSelectors.addSelectorMarks = function(url, csstext, unused, used, viewdoc, doc, h2, oncomplete, onfail, onabort)
{
	/*** DEV ***//*
	var body = doc.getElementsByTagName('body').item(0);
	var codeview = body.insertBefore(doc.createElement('pre'), body.firstChild);
	codeview.style.paddingLeft = '1.2em';
	codeview.style.color = '#666';
	var str = ''; */
	
	
	//before we do anything else, iterate through the object of unused selectors
	//to check whether every single rule has the same line number, because if so 
	//then the stylesheet has been minified too much to be able to process
	//but make sure we allow for the possibility of a stylesheet with only one rule in it
	//as well as the possibility of a stylesheet which isn't minified, but where, by chance,
	//all the unused rules are on the same line, which we establish by checking used as well
	//nb. because the iterative process works line by line, therefore the minimum layout 
	//it can handle is one whole style rule per line, optionally wrapped by @media
	//nnb. this is more reliable than checking the number of lines produce by line-break splitting
	//because the rules might be all on one line while additional lines have comments in them
	var x = null, minified = false;
	for(var i in unused)
	{
		if(unused.hasOwnProperty(i))
		{
			var n = parseInt(unused[i].split('{')[1], 10);
			if(x === null)
			{
				x = n;
			}
			else if(n != x)
			{
				minified = false;
				break;
			}
			else
			{
				minified = true;
			}
		}
	}
	if(minified)
	{
		for(var i in used)
		{
			if(used.hasOwnProperty(i))
			{
				var n = parseInt(used[i].split('{')[1], 10);
				if(n != x)
				{
					minified = false;
					break;
				}
			}
		}
	}
	
	//then if the stylesheet is minified, call and return the onfail method with the minified warning 
	if(minified)
	{
		return onfail('minified', 'warning');
	}
	

	//normalize line-breaks to unix in the raw css text 
	csstext = csstext.replace(/(\r[\n\f]?)/g, '\n');

	//then pre-process comments from the csstext, extracting each one and 
	//saving it to an array, then replacing it with the same amount of whitespace 
	//but surrounded by marking delimiters so we can identify it later
	//nb. this gets the comments out of the way so they don't confuse the parser
	//(eg. if a rule is commented out, and is inside another rule, the braces 
	// that mark the end of the rule will be mis-identified in the comment)
	//but by replacing them with whitespace that takes up the same number of lines
	//we ensure that the source code line-numbers remain exactly the same
	//this is done by replacing everything that isn't already whitespace, so the 
	//original line-breaks (and tabs) remain intact, and everything else becomes a space
	//nb. however this means that we won't be able to identify selectors with 
	//comments inside them, eg. ".udm/**/[class]", but I doubt that will be a problem
	//since you really only see that in old CSS hacks, which nobody uses anymore
	//nnb. the marker is a single character so it's easier to identify afterwards
	//using a simple regex that looks for data between each pair, but that means we must
	//use a unique delimiting character that couldn't possibly already exist in the stylesheet
	//so I'm using one of the designated non-characters, that are intended for such things
	//ie. public documents may not contain them, but programs can use them for things like this
	var comments = [];
	csstext = csstext.replace(/(\/\*([^*]|(\*+([^*\/])))*\*+\/)/gm, function(match)
	{
		comments.push(match);
		return '\ufddf' + match.replace(/[\S]/gim, ' ') + '\ufddf';
	});

	//now split and re-save the csstext into an array of individual lines 
	//nb. don't trim or anything because we must preserve the exact content
	csstext = csstext.replace(/(\r[\n\f]?)/g, '\n').split(/^/m);
	
	
	//show the abort button and change its status class to processing
	var aborter2 = viewdoc.getElementById('dms-viewcleaning-abort2');
	aborter2.setAttribute('hidden', false);
	aborter2.setAttribute('class', 'processing');
	
	//save a shortcut reference to the progressmeter 
	//then change its mode to determined and zero the value 
	//also re-show it just in case you select a different tab 
	//while it's running, because the process of compiling 
	//the view data will show and then hide it again
	//** we should abstract this progressmeter stuff into 
	//** a setUIState function (like the browser and spider have)
	var progressmeter = viewdoc.getElementById('dms-viewprogress');
	progressmeter.setAttribute('hidden', false);
	progressmeter.setAttribute('mode', 'determined');
	progressmeter.setAttribute('value', 0);
	
	//***DEV
	//function timestamp(){var s,u,now = new Date();return '['+((s = now.getSeconds()) < 10 ? ('0'+s) : s)+'.'+((u = now.getMilliseconds()) < 10 ? ('00'+u) : (u < 100 ? ('0'+u) : u))+'] ';}


	//create a virtual document (within this browser document)
	//containing a single stylesheet we can use for processing selectors
	//nb. because firefox parses and normalizes selectors, eg. evening-out 
	//its internal whitespace, removing uncessary "*", and converting things 
	//like nth-child(odd) to their linear-equation equivalent nth-child(2n+1)
	//however the csstext will contain exactly what the author wrote 
	//so we can't directly compare that text with the normalized selectors 
	//but by writing the text of a source selector to a new stylesheet rule 
	//then retrieving its selectorText from the CSS DOM, 
	//we can convert the source format to firefox's normalized format
	//and thereby compare any arbitrary piece of text with a stored selector :-)
	var dom = doc.implementation.createDocument('http://www.w3.org/1999/xhtml', 'html', null);
	var head = dom.documentElement.appendChild(doc.createElement('head'));
	var style = head.appendChild(doc.createElement('style'));
	style.setAttribute('type', 'text/css');
	var sheet = dom.styleSheets.item(0);
	
	//then create a helper function that accepts a raw source selector, 
	//and returns a normalized version, after cleaning-up the stylesheet
	//nb. we must include exception handling in case it gets passed an 
	//invalid selector, the most likely reason for which would be when we need 
	//to iterate from (line - 1) which might be a comment; or more likely,
	//one line of a multi-line comment, which would be hard to pre-identify
	//nnb. actually we might end up with something that still looks like a selector
	//eg. if a fragment of csstext is "and" or "not screen" from a media query
	//but that doesn't really matter since it won't match any listed selector 
	//* unless I suppose the document had custom elements like <and/> or <not><screen></screen></not>
	function getNormalizedSelector(selectorSource)
	{
		try
		{
			sheet.insertRule(selectorSource + '{}', sheet.cssRules.length);
			var normalized = sheet.cssRules[sheet.cssRules.length - 1].selectorText;
			sheet.deleteRule(sheet.cssRules.length - 1);
			return normalized;
		}
		catch(ex)
		{
			//***DEV 
			//log[log.length] = timestamp()+('Normalizing exception over selector syntax "'+selectorSource+'"');
			
			return null;
		}
	}
	

	//create the variables at this scope that we'll create in the first few apu loops
	//=> a re-compiled array of unused selectors in source order 
	//=> a re-compiled structural array of used/unused status flags for every selector in source order
	//=> an object for recording how many unused selectors and rules we find 
	//   and the total number of selectors we'll be looking for in the first place
	var selectors = [];
	var flags = [];
	var found = { selectors : 0, rules : 0, limit : 0 }; 
	
	//***DEV 
	//var failed = [];	
	//var log = [];
	
	
	//get the APU speed and chunksize from preferences, limiting 
	//and resaving the values if necessary, and then assigning 
	//to the tools properties which the APU actually uses
	DustMeSelectors_tools.apuspeedCreate();
	DustMeSelectors_tools.chunksizeCreate();

	//create a dictionary for APU references, with a local var for convenience
	//and also a global reference so we can abort the APUs externally
	var processors = DustMeSelectors.processors = {};
	
	//then create a master processor for overall management
	//with a chunksize of 1 so that every stage has its own timeout
	processors.master = new DustMeSelectors_tools.APU2(1, 

	//master processor => oninstance
	function(stage)
	{
		
		//=> master processor stage 
		if(stage === 0)
		{
			//iterate the master processor straight away
			//so we get a timer instance before the next bit
			//nb. because the first iteration of an APU is instant, 
			//but building the selectors and flags array might have been some work, 
			//so we should create some breathing space before doing anything else
			return processors.master.next();
		}
		
		
		//=> master processor stage
		else if(stage === 1)
		{
			//save a shortcut to the "UNRECOGNISED" selector prefix, 
			//so we can speed up the process of parsing it out of a selector
			var unrecognised = DustMeSelectors_tools.bundle.getString('error.unrecognised') + ' ';	
			
			//now re-compile the unused selectors data into array that's in overall source order 
			//where each member is a sub-object listing the rule's line-number, 
			//the selectors index with that rule, the selector text itself, 
			//and the total number of unused selectors we have for that rule, which we'll need
			//later when it comes to identifying rules where all of its selectors are unused
			//nb. we need to remove any unrecognised prefix from the selector text before comparison
			//nb. subtract one from each line number and selector index because they count from one, 
			//but it's simpler if they now match the zero-based indexing of the csstext array
			//nb. we have to organise the data into sub-groups first, where each group contains
			//all the selectors that belong to the same line number, because sorting the whole thing
			//when many members have the same sort value would not produce the stable sort we need
			//nb. don't include malformed rules, or any that don't have a line number 
			//(although afaik the only possibility of that is with a malformed rule)
			var rulegroups = [];
			for(var i in unused)
			{
				if(unused.hasOwnProperty(i))
				{
					var tmp = unused[i].split('{');
					if(tmp.length > 1)
					{
						var line = (parseInt(tmp[1], 10) - 1);
						var index = (parseInt(tmp[1].split('.')[1], 10) - 1);
						if(typeof rulegroups[line] == 'undefined')
						{
							rulegroups[line] = [];
						}
						rulegroups[line].push(
						[
							line, 
							index, 
							tmp[0].replace(unrecognised, '').replace(/^\s+|\s+$/g, '')
						]);
					}
				}
			}
			for(var i = 0; i < rulegroups.length; i ++)
			{
				if(rulegroups[i])
				{
					rulegroups[i].sort(function(a, b)
					{
						return a[1] - b[1];
					});
					for(var len = rulegroups[i].length, j = 0; j < len; j ++)
					{
						selectors.push(
						{
							line	: rulegroups[i][j][0],
							index	: rulegroups[i][j][1],
							text	: rulegroups[i][j][2],
							count	: len
						});
					}
				}
			}
			
			//then update found.limit with the number of unused selectors
			//nb. we can't keep referring to selectors.length because we'll be 
			//splicing from the front of the selectors array each time we find one
			found.limit = selectors.length;
		
		
			/*** DEV ***//*
			for(var i = 0; i < selectors.length; i ++)
			{
				str += '<code style="font:inherit;color:firebrick;">['+selectors[i].line + '.' + selectors[i].index + '-'+selectors[i].count+'] "' + selectors[i].text + '"\n</code>';
			} */


			//increment the progressmeter
			//also re-show it and re-set the mode just in case 
			//you select a different tab while it's running
			progressmeter.setAttribute('hidden', false);
			progressmeter.setAttribute('mode', 'determined');
			progressmeter.setAttribute('value', 5);
			
			//re-show and re-class the abort button likewise
			aborter2.setAttribute('hidden', false);
			aborter2.setAttribute('class', 'processing');

			//iterate the master processor
			return processors.master.next();
		}
		
		
		//=> master processor stage 
		else if(stage === 2)
		{
			//re-compile the used selectors data into a structural flags array
			//where the array is in source order and indexed by line number, 
			//and each member is a sub array also in source order and indexed 
			//by selector position (ie. its place within the list of that rule's selectors)
			//and each member of that is a boolean flag to indicate that the rule is used
			//nb. subtract one from each line number and selector index because they count from one, 
			//but it's simpler if they now match the zero-based indexing of the csstext array
			//nb. don't include malformed rules, or any that don't have a line number 
			//(although afaik the only possibility of that is with a malformed rule)
			//nb. this will create an outer with many undefined members, since it's 
			//indexed by source line number, but obviously not every line has a rule
			for(var i in used)
			{
				if(used.hasOwnProperty(i))
				{
					var tmp = used[i].split('{');
					if(tmp.length > 1)
					{
						var line = (parseInt(tmp[1], 10) - 1);
						var index = (parseInt(tmp[1].split('.')[1], 10) - 1);
						if(typeof flags[line] == 'undefined')
						{
							flags[line] = [];
						}
						flags[line][index] = true;
					}
				}
			}
			
			//then iterate through the unused selectors and add each one to the applicable 
			//all-rules sub-array, this time with a boolean flag to indicate that the rule is unused
			//so that we end up with a matrix of every single rule in the stylesheet 
			//in which the rules are in source order and the selector flags are in position order
			//then we can get the total number of selectors in each rule from the inner 
			//array lengths, and know for any given selector whether it's used or unused
			//nb. originally I did this by converting the raw csstext into a css dom 
			//but that's vulnerable to cases where the stylesheet has been updated 
			//since it was spidered, and consequently has different line numbers and rules
			//but we also need information on the position of each selector within its rule 
			//and the only way to get that was to go right back to the original per-page 
			//find operations, and add that information to the permament selectors data 
			//(which is why the clean operation must abort if the data is in the old format)
			for(var i = 0; i < selectors.length; i ++)
			{
				if(typeof flags[selectors[i].line] == 'undefined')
				{
					flags[selectors[i].line] = [];
				}
				flags[selectors[i].line][selectors[i].index] = false;
			}	
		
		
			/*** DEV ***//* 
			str += '==================================\n';
			for(var line = 0; line < flags.length; line ++)
			{
				if(typeof flags[line] != 'undefined')
				{
					str += '<code style="font:inherit;color:forestgreen;">[' + line + '='+flags[line].length + '] ';
					for(var index = 0; index < flags[line].length; index ++)
					{
						if(typeof flags[line][index] != 'undefined')
						{
							str += '\n\t[' + line + '.' + index + ']';
							if(flags[line][index] === true) { str += ' <span style="font:inherit;font-size:12px;color:blue;">\u2714</span>'; }
							else { str += ' <span style="font:inherit;font-size:12px;color:red;">\u2718</span>'; }
						}
					}
					str += '\n</code>';
				}
			} */
		

			//increment the progressmeter 
			//also re-show it and re-set the mode just in case 
			//you select a different tab while it's running
			progressmeter.setAttribute('hidden', false);
			progressmeter.setAttribute('mode', 'determined');
			progressmeter.setAttribute('value', 10);
			
			//re-show and re-class the abort button likewise
			aborter2.setAttribute('hidden', false);
			aborter2.setAttribute('class', 'processing');

			//iterate the master processor
			return processors.master.next();
		}
		
		
		//=> master processor stage 
		else if(stage === 3)
		{
			//abstraction for identifying and marking an unused selector or rule 
			//nb. the marks are all designated non-characters:
			//		selector start		fdd0		selector end		fdd1
			//		rule start			fdd2		rule end			fdd3
			//		temporary start		fdd4		temporary end		fdd6
			//this provides the safety we need, and will also make them easier to find 
			//and extract with regular expressions, when it comes to display and output
			//nnb. the characters aren't saved to preferences or vars because then I'd 
			//have to use the RegExp constructor for the patterns they appear in, instead 
			//of using regex literals, but I don't trust the constructor because the 
			//expressions it produces are not always identical (and it leaks memory anyway)
			function findSelector(line)
			{
				//***DEV 
				//log[log.length] = timestamp()+('Looking for <n=' + (found.limit - selectors.length) + '> "' + selectors[0].text + '" at line [' + line + ']');
				
				//remember whether we marked a selector, assuming false
				var marked = false;
				
				//if the line number exceeds the number of lines 
				//in the csstext array, then it's most likely because 
				//the selector's line number no longer exists in the stylesheet 
				//(because it's been edited to have fewer lines than since it was spidered,
				// which includes the possibility of it containing nothing but whitespace,
				// although completely empty stylesheets are caught at the loading stage)
				if(line >= csstext.length)
				{
					//***DEV 
					//failed.push({line:selectors[0].line, text:selectors[0].text});
					//log[log.length] = timestamp()+('Run out of lines (line >= length) testing "' + selectors[0].text + '"');
					
					//so shift this member off the start of the selectors array
					selectors.shift();
					
					//then return null so we know not to proceed to look 
					//for the same selector again via (line - 1) iteration 
					//otherwise we'll end up recording the same failure twice
					return null;
				}
				
				//parse out any leading @media wrapper and save it separately, 
				//(including any closing rule-marker which might now be there, since 
				// we now extend those marks to include up to one trailing line-break)
				//then assign the resulting csstext line to a local copy
				//then split the line by commas, retaining all whitespace 
				//nb. we have to do this parsing in case the entire media wrapper and rule 
				//is all on one line (but don't worry about its closing brace, that will be handled later)
				//nb. since we've already removed any media wrapper, 
				//the remaining commas can only be selector delimiters 
				var 
				ruleMedia = '', 
				fragments = csstext[line].replace(/^([\ufdd3]?\s*@media[^\{]*\{\s*)?(.*)$/im, 
				function(all, atmedia, remainder)
				{
					//nb. if there is no media wrapper than atmedia will be undefined in FF34+ 
					//(see https://bugzilla.mozilla.org/show_bug.cgi?id=369778)
					//whereas in FF33- it was an empty string, and the difference means that 
					//we'd be assigning undefined to ruleMedia, which would ultimately
					//lead to a whole bunch of "undefined" appearing in the cleaned output
					//ruleMedia = atmedia;
					ruleMedia = atmedia || '';
					
					return remainder;
				
				}).split(',');
				

				//inner abstraction for marking the found selector or rule
				//nb. this is nested so it can refer to variables in the parent scope, 
				//which reduces the number of arguments it needs; originally it was nested 
				//inside the fragments iteration, but the continual re-declaration made it 
				//way too inefficient to allow, whereas this is an acceptable compromise
				function addSelectorMark(index)
				{
					//if the number of unused selectors recorded for this rule 
					//is the same as the number of ALL selectors recorded for the rule
					//we want to mark the whole rule and not its individual selectors
					//plus if the rule is the only one inside an @media wrapper
					//we want to extend the mark so that it wraps around that as well
					if(selectors[0].count == flags[selectors[0].line].length)
					{
						//so, mark the start of this rule with a temporarily different mark
						//so we can differentiate it from all the existing marked rules
						fragments[index] = fragments[index].replace(copy, '\ufdd4' + copy);
	
						//rejoin the fragments and re-prepend any media wrapper 
						//then save the whole thing back to the csstext array
						csstext[line] = ruleMedia + fragments.join(',');
	
						//now iterate from this line number until we reach 
						//the rule's closing brace, and add a closing mark around that
						//use the same temporarily different mark as the opening one
						//nb. this will wrap around the end of the first brace we find
						//so it doesn't matter if the line has more than one (eg. closing @media) 
						//** unless there's a brace symbol in [foo="{bar}"] or content:"{bar}";
						for(var next = line; next < csstext.length; next ++)
						{
							if(/\}/im.test(csstext[next]))
							{
								csstext[next] = csstext[next].replace(/([^\}]*)(\})/im, '$1$2\ufdd5');
								break;
							}
						}
						
						//***DEV 
						//log[log.length] = timestamp()+('Found <n=' + (found.limit - selectors.length) + '|x='+index+'> "' + selectors[0].text + '" and the '+(selectors[0].count - 1)+' selectors after it');
						

						//now temporarily re-join the whole csstext array 
						//beause the content we're looking for might be on different lines
						csstext = csstext.join('');

						//then run a regex on the context around the marks we created 
						//and if they match the pattern of a one-rule media block 
						//extend the opening mark around the start and end of that
						//* (or is there any chance of "<" inside the rule? maybe in a comment??
						//* it couldn't be [foo="<"] because you can't have that character in an attribute,
						//* it would have to be encoded, but then would it be addressed [foo="&lt;"]?)
						csstext = csstext.replace(/(@media[^\{]+\{\s*)(\ufdd4)([^<]+)(\ufdd5)(\s*\})/im, '$2$1$3$5$4');
						
						//then either way, extend the mark around any leading or trailing spaces or tabs, 
						//plus a maximum of one trailing line-break (for which \r is already converted to \n)
						//nb. we limit whitespace removal here to avoid losing too much formatting
						//nb. we do this separately so it catches all marked rules, not just media blocks
						csstext = csstext.replace(/([\t ]*)(\ufdd4)/i, '$2$1').replace(/(\ufdd5)([\t ]*[\n]?)/im, '$2$1');
						
						//now we can re-convert the temporary marks to normal ones
						//nb. we couldn't do that in the regex in case we didn't find 
						//an applicable media wrapper, which will usually be the case
						//nb. use a different tag from single selectors so we can differentiate them 
						csstext = csstext.replace(/[\ufdd4]/gim, '\ufdd2').replace(/[\ufdd5]/gim, '\ufdd3');
						
						//then re-split the csstext back into its array
						csstext = csstext.split(/^/m);
						
						
						//add (count) to found.selectors, and 1 to found.rules 
						found.selectors += selectors[0].count;
						found.rules ++;
						
						//then splice (count) members from the start of the selectors array 
						//so that we don't check any more selectors in this rule, 
						//then we'll only get one mark around the whole rule, 
						//instead of nested marks around each component selector
						selectors.splice(0, selectors[0].count)
					}
					
					//else mark the single selector, and its trailing or leading comma
					//nb. aim to wrap the mark around the selector's trailing comma 
					//because that's what most people seem to use when defining a rule 
					//with multiple selectors that are written over several lines,
					//ie this:					rather than this:
					//				foo,							foo
					//				bar,							,bar
					//				foobar							,foobar
					//neither is simpler to implement though, but that's no surprise!
					//I mean really ... when I started out writing this cleaning function, 
					//I had no idea just how mind-numbingly complicated it would turn out be ... 
					//it's taken more than 60 programming hours to make it all work :-O
					//(and that's why there's so much commenting -- it's all my trains of thought!)
					else
					{
						//so, mark this single selector with a temporarily different mark
						//so we can differentiate it from all the existing marked selectors
						fragments[index] = fragments[index].replace(copy, '\ufdd4' + copy + '\ufdd5');
	
						//then rejoin the fragments and re-prepend any media wrapper 
						//then save the whole thing back to the csstext array
						csstext[line] = ruleMedia + fragments.join(',');
						
						//***DEV 
						//log[log.length] = timestamp()+('Found <n=' + (found.limit - selectors.length) + '|x='+index+'> "' + selectors[0].text + '"');
						
						
						//now temporarily re-join the whole csstext array 
						//beause the comma we're looking for might be on a different line
						csstext = csstext.join('');
						
						//identify whether this selector is part of a subset of 
						//contiguous unused selectors which includes the very last one 
						//eg. "used, unused" or "used, unused, unused" 
						//or "unused, used, used, unused, unused, unused"
						//nb. we must use strict equality to refer to flags data, so there's no
						//possibility of treating a member as unused when it's actually undefined
						for(var subset = false, setindex = (flags[selectors[0].line].length - 1); setindex >= 0; setindex --)
						{
							if(flags[selectors[0].line][setindex] === true)
							{
								break;
							}
							else if(setindex == selectors[0].index)
							{
								subset = true;
								break;
							}
						}

						//and if so, extend the mark around its leading comma
						//(including any whitespace back to the previous selector)
						//nb. this will fail if the previous selector couldn't be identified
						//eg. an old CSS hack with an internal comment like "*:root .udm/**/[class="udm"] ul li"
						//resulting in the possibility of the output selector having an invalid trailing comma
						if(subset === true)
						{
							csstext = csstext.replace(/(\s*),(\s*)(\ufdd4)/im, '$3$1,$2');
						}

						//otherwise extend the mark around its trailing comma
						//(including any whitespace up to the next selector)
						//nb. this will probably also fail if the next selector can't be identified
						else
						{
							csstext = csstext.replace(/(\ufdd5)(\s*),(\s*)/im, '$2,$3$1');
						}
						
						//now we can re-convert the temporary marks to normal ones
						//nb. the marks might be on different lines now, so we can't 
						//just do this to csstext[line] after csstext has been re-split
						csstext = csstext.replace(/\ufdd4/gim, '\ufdd0').replace(/\ufdd5/gim, '\ufdd1');
						
						//then re-split the csstext back into its array
						csstext = csstext.split(/^/m);
						
						
						//add one to the found.selectors count
						found.selectors ++;
						
						//then shift this member off the start of the selectors array
						selectors.shift();
					}
						
					//set the marked flag so that findSelector returns that we found one
					marked = true;
				}
				

				//then for each of the selector fragments we created
				for(var index = 0; index < fragments.length; index ++)
				{
					//create a temporary comparison copy which is 
					//parsed of anything that isn't part of the selector 
					//originally I just used a regex to remove everything found after 
					//the opening brace surrounding the properties, however it is possible
					//for the fragments to contain two braces if the first opens an @media block
					//so split by opening braces and save back member [1] if we get 
					//three members (for the @media situation), or member [1] if we get 
					//two members but the first trimmed member is empty, or member [0] otherwise
					//then trim the result and save it back to the copy var
					//nb. all of this is only necessary to cover the possibility
					//that a single line of css contains an entire rule or media group, 
					//or the selector and properties of a rule, or the selector and @media wrapper
					//though of course, in a wider sense, it's only necessary because we don't 
					//have the precise syntax of the selector, only its normalized syntax 
					//(in fact most of the problems we've dealt with in this process stem from that ...
					// well, that and the fact that the line numbers we have can't be relied on; but I digress!)
					//** nb. it is still possible for this to fail, eg if the fragments is 
					//** (max-width:5000px){*:last-child+html [data-number="7"]
					//** ie. part of @media but not "@media" itself, followed by
					//** an opening brace but then no further opening rule brace
					//** this further means that if there are two identical selectors 
					//** at different points in the stylesheet but with different formatting
					//** and the first one is failure but the second one is okay, then the 
					//** second one will be marked twice and no failure will be recorded
					//** but I don't think I can fix this without either adjusting the condition 
					//** and breaking a different permutation, or defining a more complex expression 
					//** that can recognise any part of any @media statement or query (if that's possible)! 
					//** so since all of this is an extreme edge case anyway, I'm just gonna leave it now :-p
					var copy = fragments[index].split('{');
					copy = copy[(copy.length == 3 || (copy.length == 2 && copy[0].replace(/^\s+|\s+$/g, '') == '')) ? 1 : 0].replace(/^\s+|\s+$/g, '');
					
					//parse out any opening or closing marks from the copy
					//nb. this wasn't originally necessary, because we could simply continue 
					//to the next iteration when we came across a fragment with a mark in it
					//on the rationale that any such fragment is already a marked selector 
					//however now that the marks extend around commas including surrounding whitespace
					//the opening and closing marks can now be on different lines, so there 
					//might be a mark on the same line as another as-yet-unmarked selector
					//nnb. the fact that we remove both opening and closing marks means that 
					//if a rule has multiple instances of the same selector, we'll just keep 
					//marking the same (first) one every time; but that isn't likely to happen,
					//cos why would you define a rule with the same selector more than once?
					//we could fix that by only removing closing marks, but then we'd get 
					//a lot more normalizing exceptions from selectors we've already marked 
					//and although they don't really matter per se, they mean we're wasting resources
					//and if we can prevent that, we should, rather than cater for an unreal use-case!
					copy = copy.replace(/[\ufdd0\ufdd1\ufdd2\ufdd3]/gim, '');
					
					//if the copy is empty (or only whitespace) continue to the next fragment
					if(!/\S/.test(copy)) { continue; }
					
					//else if the selector is exactly the same as the copy, it's this one!
					//so call the addSelectorMark abstraction, and then break fragments iteration
					if(copy == selectors[0].text)
					{
						//***DEV 
						//log[log.length] = timestamp()+('[n='+(found.limit - selectors.length)+'] Checking "'+selectors[0].text+'"');
						
						addSelectorMark(index);
						break;
					}
					
					//else normalize the copy and then try the comparison again
					//nb. if getNormalizedSelector catches an exception then it returns null
					else if(getNormalizedSelector(copy) == selectors[0].text)
					{
						//***DEV
						//log[log.length] = timestamp()+('[n='+(found.limit - selectors.length)+'] Checking "'+selectors[0].text+'"');
						
						addSelectorMark(index);
						break;
					}
				}
				
				//return whether we marked a selector or rule
				return marked;
			}
			
			
			//create a processor to iterate through the selectors array, to find and mark 
			//the unused selectors and rules, for as long as we have any still to find
			//passing a chunksize of null so that it uses the preference value
			processors.selectors = new DustMeSelectors_tools.APU2(null, 
		
			//selectors processor => oninstance
			function()
			{
				//record the current length of the selectors array, that we'll check
				//at the end of this iteration to see if we need emergency breaking
				var currentlength = selectors.length;
				
				
				//abstraction for the stuff we do at the end of each selectors oninstance
				//either straight after we've found the selector if it's where we expect,
				//or from a lines processor oncomplete if we have to go looking for it
				//(or from a lines processor onabort if we run out of lines while doing that)
				function doneThisSelector()
				{
					//increment the progressmeter to show the number of selectors 
					//we've found (or know we've failed to find) divided by the 
					//total number of selectors, as a rounded-up proportion 
					//of 90% added to the 10% we started this process with
					//also re-show it and re-set the mode just in case 
					//you select a different tab while it's running
					progressmeter.setAttribute('hidden', false);
					progressmeter.setAttribute('mode', 'determined');
					progressmeter.setAttribute('value', Math.ceil(((found.selectors / found.limit) * 90) + 10));
			
					//re-show and re-class the abort button likewise
					aborter2.setAttribute('hidden', false);
					aborter2.setAttribute('class', 'processing');
			
					//now if the length of the selectors array hasn't changed during this iteration
					//then something unexpected has gone wrong, so jump straight to completion
					//and we'll get to the output stage with however much we've done
					//nb. we can test this condition by neglecting to remove a member 
					//that we know we've failed to find; and even though there's 
					//no known situation where this would actually happen, we can't 
					//take the chance of the lines processor iterating forever, as it would
					//eventually overwhelm the browser and the user would have to force-quit
					if(currentlength == selectors.length)
					{
						//***DEV
						//log[log.length] = timestamp()+('Emergency break with ' + (selectors.length) + ' selectors still to find');
						
						return processors.selectors.abort();
					}
					
					//else if the H2 group header is no longer there, this means 
					//that the user has selected a different host's data to view 
					//(or re-selected this host), so abort the selectors processor
					//which will then abort the master processor and abandon the whole process
					//nb. this won't get triggered if you merely select a different tab
					//it will carry on compiling and be ready when you come back :-)
					//(and the progressmeter will continue to show this activity)
					//however if you "mark unused" any selectors from the "used" tab
					//that will cause the unused browser to be cleared, and that 
					//in turn will trigger this condition and abandon the process
					//likewise if you run another scan or spider while this is happening
					//as soon as it gets to updating the viewdialog, the same will happen
					else if(!h2.parentNode)
					{
						//***DEV
						//log[log.length] = timestamp()+('User abandoned the process with ' + (selectors.length) + ' selectors still to find');
						
						return processors.selectors.abort();
					}
					
					//else if the selectors array is now empty, complete the selectors processor
					else if(selectors.length == 0)
					{
						return processors.selectors.complete();
					}
					
					//else iterate the selectors processor
					else
					{
						return processors.selectors.next();
					}
				}
				
				
				//if the source selector text is split across multiple lines, the line number
				//we have for it might not be accurate, because it denotes the index at which 
				//the whole rule starts, which might be one or more lines earlier than this selector
				//we couldn't do much about that before, because we didn't have access to the 
				//original source csstext, but now that we do, we have to compensate, otherwise 
				//we won't be able to find this selector -- it won't be at the line we're expecting
				
				//so, pass this selector's line to the mark function, and if we find it at the 
				//expected line, we can call the end of selector instance abstraction straight away
				//nb. if findSelectors returns null we don't keep checking, only if it returns false
				//(because it only returns to null to indicate when we've run out of lines to check)
				if(findSelector(selectors[0].line) !== false)
				{
					return doneThisSelector();
				}
				
				//if we don't find it, it's probably one of those selectors that spans multiple lines 
				//so iterate from the line number before this one, until we either mark the selector
				//or we reach a line containing a start-of-rule brace (which means we failed to find it)
				//nb. we would ideally start from the index after this one, because if it's not on this line
				//then it surely must be on a line after it .. except that, for reasons I can't fathom, 
				//firefox /still/ returns the wrong line-number from domutils.getRuleLine -- whenever the rule 
				//in question has a single element selector, eg. "a", the returned line number is 1 greater 
				//than the actual line number (https://bugzilla.mozilla.org/show_bug.cgi?id=850230)
				//now I don't really feel confident enough to just catch that specific situation 
				//since I don't understand why that would happen and my reading of its circumstances
				//is incomplete, so (!) just to cover that general possibility, let's begin to search 
				//from the line before this one (which we know won't contain another conflicting 
				//selector, since even if it does contain another instance of the same selector, 
				//well that one would already be or will be marked as unused anyway, so the iterator
				//would either mark it now and not need to later, or skip over it as marked already)
				else
				{
					//save a local copy of the selector's (line number - 1), limiting to zero 
					//just in case this is the first line (which is unlikely but possible!)
					//this will be then added to the lines processor index, to increment by one line each time
					//nb. we might encounter a comment on the line before this one 
					//but if we do it will be caught by the normalizer's exception handler
					//** nb. if a stylesheet has been edited such that any of the stored line numbers 
					//** are higher than the number of lines in the updated stylesheet (since it was spidered)
					//** we won't find any of those later rules because we stop when we reach csstext.length
					//** we could fix that with another set of iterations, which only happens if we have 
					//** failures once we've reached the end of normal iteration, that then 
					//** iterates through the entire csstext array to look for each selector 
					//** it's brute force though, and arguably not worth it for such an edge case
					//** cos really ... it's getting to the point where we have to say, just how much scope
					//** can we provide for users cleaning stylesheets that don't match their view data,
					//** rather than just saying "hey, you need to trash that data and re-spider the site"
					var next = (next = selectors[0].line - 1) < 0 ? 0 : next;
					
					
					//create a processor to iterate through the lines of csstext
					//until we find the selector or we run out of lines to check
					//passing a chunksize of null so that it uses the preference value
					processors.lines = new DustMeSelectors_tools.APU2(null, 
				
					//lines processor => oninstance
					function(addline)
					{
						//***DEV
						//log[log.length] = timestamp()+('Looking for <n=' + (found.limit - selectors.length) + '> "' + selectors[0].text + '" at next-line (' + (next + addline) + ')');
		
						//if the next line number exceeds the number of lines in the csstext array, 
						//then we must have reached the end of the stylesheet without matching this selector
						if((next + addline) == csstext.length)
						{
							//***DEV
							//failed.push({line:selectors[0].line, text:selectors[0].text});
							//log[log.length] = timestamp()+('Run out of lines (next == length) testing "' + selectors[0].text + '"');
								
							//so shift this member off the start of the selectors array
							selectors.shift();
							
							//then abort the lines processor
							return processors.lines.abort();
						}
					
						//else if we find the selector on this line
						else if(findSelector(next + addline))
						{
							//complete the lines processor 
							return processors.lines.complete();
						}
						
						//else iterate the lines processor, to continue to check the next line
						//nb. this will keep going all the way to the end of the stylesheet 
						//until it either finds the selector, or it runs out of lines to check
						//originally I made it stop if it reaches the opening-brace of 
						//the selector's properties, but that meant we couldn't handle situations 
						//where the stylesheet has been edited since it was spidered, 
						//ie. if the selector we want no longer has the line number we recorded,
						//so in a sense, it's worked out quite well that firefox's line numbers are
						//unreliable, since we've had to allow for any selector to be at any line
						//nnb. however it does mean we'll get lots more normalizing exceptions, 
						//as entire rules, properties, media queries etc. are tested; but that's fine
						//nnnb. well, it's almost fine -- the only way it could be a problem is if, 
						//between where the selector is expected to be, and where it actually is, 
						//there's a comment which contains the exact text of the same selector 
						//on its own line (!) I can't imagine there's any real chance of that actually 
						//happening ... but if it does, the text inside the comment will be marked 
						//instead of the real selector, then recorded as found (because it was found!)
						else 
						{ 
							return processors.lines.next();
						}
					},
					
					//lines processor => oncomplete
					function(addline)
					{
						//clear the running flag
						processors.lines.running = false;
						
						//call the end of selector instance abstraction
						return doneThisSelector();
					},
					
					//lines processor => onabort
					function(addline)
					{
						//clear the running flag
						processors.lines.running = false;
						
						//call the end of selector instance abstraction
						return doneThisSelector();
					});
			
					//define a running flag on the lines processor
					//so we can check from the selectors processor onabort
					//and abort any running instance if it's called directly
					processors.lines.running = true;
					
					//start the lines processor
					return processors.lines.start();
				}
			},
			
			//selectors processor => oncomplete
			function()
			{
				//clear the running flag
				processors.selectors.running = false;
				
				//iterate the master processor
				return processors.master.next();
			},
			
			//selectors processor => onabort
			function()
			{
				//clear the running flag
				processors.selectors.running = false;
				
				//if we have a running lines procesor, abort that that first
				if(processors.lines && processors.lines.running)
				{
					processors.lines.abort(); 
				}
		
				//abort the master processor
				return processors.master.abort();
			});
			
			//define a running flag on the selectors processor
			//so we can check from the master processor onabort
			//and abort any running instance if it's called directly
			processors.selectors.running = true;
	
			//start the selectors processor 
			return processors.selectors.start();
		}
		
		
		//=> final master processor stage 
		else
		{
			//rejoin the csstext, then parse successive sets of comment markers
			//back to the original comment text we extracted at the start
			//nb. we only need join the csstext by empty string because 
			//it still contains the line-breaks it had to begin with
			csstext = csstext.join('').replace(/(\ufddf[^\ufddf]+\ufddf)/gim, function()
			{
				return comments.shift();
			});
			

			/*** DEV ***//*
			str += '==================================\n';
			str += '<code style="font:inherit;color:purple;">Found and marked ' + found.selectors + ' of ' + found.limit + ' selectors';
			str += ' (including ' + found.rules + ' complete rules)';
			
			//if(failed.length > 0)
			//{
			//	str += ', but failed to find ' + failed.length + ' selectors:</code>';
			//	for(var i = 0; i < failed.length; i ++)
			//	{
			//		str += '\n<code style="font:inherit;color:purple;">['+failed[i].line + '] "' + failed[i].text + '"</code>';
			//	}
			//}
			//else 
			{ str += '</code>'; }
			
			str += '\n==================================\n';
			
			var n = 0, csscode = '[' + (n++) + '] '
				+ csstext.split(/^/m).join('~~~')
					.replace(/^(~~~)/gm, function(a,b){ return a.replace(b,'['+(n++)+'] '); })
					.replace(/&/g,'&amp;')
					.replace(/</g,'&lt;')
					.replace(/>/g,'&gt;');

			csscode = csscode.replace(/[\ufdd0]/g, '<mark style="font:inherit;color:#d22;background:#ffc;border-left:3px double darkviolet;border-right:3px double darkorange;margin-right:1px;">');
			csscode = csscode.replace(/[\ufdd1]/g, '</mark>');
			csscode = csscode.replace(/[\ufdd2]/g, '<del style="font:inherit;color:#22d;background:#cff;border-left:3px double red;border-right:3px double blue;margin-right:1px;text-decoration:none;">');
			csscode = csscode.replace(/[\ufdd3]/g, '</del>');
			
			str += '<span style="display:block;font:inherit;" ondblclick="var marks = this.getElementsByTagName(\'mark\');while(marks.length != 0) { this.removeChild(marks[0]); } var dels = this.getElementsByTagName(\'del\');while(dels.length != 0) { this.removeChild(dels[0]); }">' + csscode + '</span>\n';
		
			//if(log.length > 0)
			//{
			//	str += '==================================\n';
			//	for(var i = 0; i < log.length; i ++)
			//	{
			//		str += '<code style="font:inherit;color:indianred;">'+log[i].replace(/^\s+|\s+$/g, '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '\n</code>';
			//	}
			//}
			
			try
			{
				var docfrag = doc.createElement('div');
				docfrag.innerHTML = str;
				//docfrag.innerHTML = str.replace(/</g,'&lt;').replace(/>/g,'&gt;');
				while(docfrag.hasChildNodes())
				{
					codeview.appendChild(docfrag.childNodes[0]);
				}
			}
			catch(ex)
			{
				var dataURI = 'data:text/html;charset=utf-8,' + encodeURIComponent(str);
				DustMeSelectors_browser.viewdialog.open(dataURI);
			}
			h2.addEventListener('dblclick', function(e)
			{
				DustMeSelectors_browser.viewdialog.alert(csscode);
				e.stopPropagation();
			
			}, false); 
			*/
		

			//max-out the progressmeter 
			//also re-show it and re-set the mode just in case 
			//you select a different tab while it's running
			progressmeter.setAttribute('hidden', false);
			progressmeter.setAttribute('mode', 'determined');
			progressmeter.setAttribute('value', 100);

			//complete the master processor
			return processors.master.complete();
		}
		
	},
	
	//master processor => oncomplete
	function(stage)
	{

		//reset the progessmeter and hide it again
		//in case this was triggered by something that didn't reset it
		//(eg. when marking from the used tab, rather than [re-]selecting a host)
		progressmeter.setAttribute('mode', 'undetermined');
		progressmeter.setAttribute('hidden', true);

		//reset the abort button class and re-hide it
		aborter2.removeAttribute('class');
		aborter2.setAttribute('hidden', true);

		//nullify the virtual document to clean it from memory
		dom = null;
		
		//nullify the global processors reference
		DustMeSelectors.processors = null;
		
		//then pass the joined csstext it back through oncomplete
		//along with the found object that has the processing summary
		return oncomplete(csstext, found);
	
	},
	
	//master processer => onabort
	function(stage)
	{

		//if we have a running selectors procesor, abort that that first
		if(processors.selectors && processors.selectors.running)
		{
			processors.selectors.abort(); 
		}

		//reset the progessmeter and hide it again
		//in case this was triggered by something that didn't reset it
		//(eg. when marking from the used tab, rather than [re-]selecting a host)
		progressmeter.setAttribute('mode', 'undetermined');
		progressmeter.setAttribute('hidden', true);
		
		//reset the abort button class and re-hide it
		aborter2.removeAttribute('class');
		aborter2.setAttribute('hidden', true);
		
		//nullify the virtual document to clean it from memory
		dom = null;
		
		//nullify the global processors reference
		DustMeSelectors.processors = null;
		
		//then call onabort 
		return onabort();

	});
	
	
	//finally bind a left-button click event to the abort button
	//that will trigger the master abort and stop the cleaning function
	//and lead to the view being reset without having to re-compile the data
	//nb. the abort button is just an <image> rather than a <button> because 
	//the moz-apeparance override styling didn't work in windows, and that 
	//means that it's not keyboard accessible, however we also have a global
	//keystroke that calls abort if the Escape key is pressed while it's running
	aborter2.addEventListener('click', function(e)
	{
		if(!e.button)
		{
			processors.master.abort();
		}
	}, false);
	
	//then start the master processor to kick everything off
	return processors.master.start();
	
};





//re-key an object indexed by string-numeric keys
//input might be a string so we have to test for that
//and if so pass it through unchanged
DustMeSelectors.rekey = function(obj)
{
	var 
	n = 0, 
	newobj = {};
	if(typeof obj == 'object')
	{
		for(var i in obj)
		{
			if(obj.hasOwnProperty(i) && /^[0-9]+$/.test(i))
			{
				newobj[n++] = obj[i];
			}
		}
		return newobj;
	}
	else { return obj; }
};


//re-sort a single stylesheet's selectors object into rule-key order
//or if the data is just a string error message then return it straight back
//** really I should re-design the selectors data to use arrays
//** but the existing structure is so deeply entrenched, 
//** I'm frankly scared to change it! so this is just band-aid
//** shouldn't really be counting on the order of object iteration anyway
//** and indeed, it's not significant, it's just nice for the data to be in order
//** so since firefox does iterate in a predictable order, let's have that niceness :-)
DustMeSelectors.resort = function(data)
{
	if(typeof data == 'string') 
	{ 
		return data; 
	}
	
	var keys = [];
	for(var i in data)
	{
		if(data.hasOwnProperty(i))
		{
			//nb. parse the keys to numbers so they don't get sorted as strings
			//even though we convert them back to strings in the final data
			keys.push([parseInt(i, 10), data[i]]);
		}
	}
	keys.sort(function(a,b)
	{
		return a[0] - b[0];
	});
	
	var sorted = {};
	for(var len = keys.length, i = 0; i < len; i ++)
	{
		sorted[keys[i][0].toString()] = keys[i][1];
	}
	return sorted;
};



