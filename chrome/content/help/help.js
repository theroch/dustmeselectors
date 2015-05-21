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
	
	//update any platform-specific language, which we can 
	//identify by the "[platform]-lang" class on each affected element
	//then a "dms:[platform]" attribute that stores the platform language
	//for inner text, or "dms:[platform]-[foo]" that stores it for the 
	//attribute identified by [foo], eg. "dms:winnt-src" for an "src" attribute
	var attrname = null, datanodes = [], len = 0;
	if(/win/i.test(navigator.platform))
	{
		datanodes = document.getElementsByClassName('winnt-lang');
		attrname = 'dms:winnt';
	}
	else if(/mac/i.test(navigator.platform))
	{
		datanodes = document.getElementsByClassName('darwin-lang');
		attrname = 'dms:darwin';
	}
	else if(/linux/i.test(navigator.platform))
	{
		datanodes = document.getElementsByClassName('linux-lang');
		attrname = 'dms:linux';
	}
	if((len = datanodes.length) > 0)
	{
		for(var i = 0; i < len; i ++)
		{
			var attrs = datanodes[i].attributes;
			for(var alen = attrs.length, a = 0; a < alen; a ++)
			{
				if(attrs[a].name == attrname)
				{
					datanodes[i].firstChild.nodeValue = attrs[a].value;
				}
				else if(attrs[a].name.indexOf(attrname + '-') >= 0)
				{
					datanodes[i].setAttribute(attrs[a].name.split(attrname + '-')[1], attrs[a].value);
				}
			}
		}
	}

}, false);

