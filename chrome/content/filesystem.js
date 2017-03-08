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


//dust-me selectors filesystem object
//much of this is based on the code snippets at
//http://developer.mozilla.org/en/docs/Code_snippets:File_I/O
//http://developer.mozilla.org/en/docs/XUL_Tutorial:Open_and_Save_Dialogs
var DustMeSelectors_filesystem = new Object();



//get the dustmeselectors-data folder inside the profile directory
//either creating it, or getting the path if it exists already
DustMeSelectors_filesystem.getDataFolder = function()
{
	//get the datafolder path preference
	var dirpath = DustMeSelectors_preferences.getPreference('string', 'datafolder');

	//if we datafolder preference is empty
	if(dirpath == '')
	{
		//get the profile data directory
		var datafolder = Components.classes["@mozilla.org/file/directory_service;1"]
			.getService(Components.interfaces['nsIProperties'])
			.get('ProfD', Components.interfaces.nsIFile);

		//create the writeable data directory inside it, if it doesn't already exist
		//nb. set 777 permissions to try to avoid issues with user/group permissions in linux
		//(which happened when the permissions were set to 600 for the current user)
		datafolder.append('dustmeselectors-data');
		if(!datafolder.exists() || !datafolder.isDirectory())
		{
			datafolder.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0777);
		}
	}

	//otherwise create the folder reference from that path
	//** what if the folder has subsequently been deleted?
	else
	{
		datafolder = Components.classes["@mozilla.org/file/local;1"]
			.createInstance(Components.interfaces.nsIFile);
		datafolder.initWithPath(dirpath);
	}

	//save the datafolder path
	this.datapath = datafolder.path;

	//create the trash folder if it doesn't already exist
	var trashfolder = datafolder.clone();
	trashfolder.append('trash');
	if(!trashfolder.exists() || !trashfolder.isDirectory())
	{
		trashfolder.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0777);
	}

	//create and save a pointer to the trash folder
	this.trashpointer = Components.classes["@mozilla.org/file/local;1"]
		.createInstance(Components.interfaces.nsIFile);
	this.trashpointer.initWithPath(trashfolder.path);


	//look for a legacy hostsindex file from before we converted to JSON
	//if we have one and it's not empty, get the legacy hosts data from it 
	//and split it into an array; otherwise create an empty legacy array;
	//then delete the legacy file so we never do this again
	var legacyhosts = datafolder.clone();
	legacyhosts.append('hostsindex');
	if(legacyhosts.exists())
	{
		var legacyindex = this.getFromFile('hostsindex');
		if(legacyindex != '')
		{
			legacyindex = legacyindex.split(',');
		}
		else
		{
			legacyindex = [];
		}
		legacyhosts.remove(false);
	}
	
	//or if we don't have one, also set the legacyindex to an array empty
	else { legacyindex = []; }
	

	//create the hostsindex file if it doesn't already exist
	var hostsindex = datafolder.clone();
	hostsindex.append('hostsindex.json');
	if(!hostsindex.exists())
	{
		hostsindex.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0777);
	}
	
	//create the autorunhosts file if it doesn't already exist
	var autorunhosts = datafolder.clone();
	autorunhosts.append('autorunhosts.json');
	if(!autorunhosts.exists())
	{
		autorunhosts.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0777);
	}
	
	
	//and return the legacyindex array, which will always be empty
	//apart from the first time a user loads version 3.0 with legacy information
	return legacyindex;
};



//launch the data folder in the user's GUI, so they can see its contents
DustMeSelectors_filesystem.launchDataFolder = function()
{
	var filepointer = Components.classes["@mozilla.org/file/local;1"]
		.createInstance(Components.interfaces.nsIFile);
	filepointer.initWithPath(this.datapath);
	//NOTE FOR REVIEWERS: there is no other function that does this job
	filepointer.launch();
};



//delete all stored data except the autorunhosts index 
//the simplest approach to which is to delete the entire data folder
//then create a new (empty) one, then copy the autorunhosts back to that
//(as opposed to iteratively deleting everything except that)
//nb. this is called by the quit observer when deleteonquit is enabled
DustMeSelectors_filesystem.deleteStoredData = function()
{
	//get the autorunhosts data, which we don't need to parse
	var autorunhosts = this.getFromFile('autorunhosts.json');
	
	//initialize a pointer to the data folder
	var filepointer = Components.classes["@mozilla.org/file/local;1"]
		.createInstance(Components.interfaces.nsIFile);
	filepointer.initWithPath(this.datapath);

	//then delete the folder
	filepointer.remove(true);
	
	//now create a new folder
	this.getDataFolder();
	
	//then re-save the autorunhosts data 
	this.dumpToFile('autorunhosts.json', autorunhosts);
}; 



//initialize a file pointer with the given name
DustMeSelectors_filesystem.initFilePointer = function(filename)
{
	var filepointer = Components.classes["@mozilla.org/file/local;1"]
		.createInstance(Components.interfaces.nsIFile);
	filepointer.initWithPath(this.datapath);
	filepointer.append(filename);

	return filepointer;
};



//dump data to a new or existing file
DustMeSelectors_filesystem.dumpToFile = function(filename, data)
{
	//initialize a file pointer with the given name
	var filepointer = this.initFilePointer(filename);

	//open and initialize the file stream (write | create | truncate) with full permissions
	//then read the data through a convertor stream and close them both again
	//nb. we have to use a convertor stream so that we can handle utf-8 characters
	var stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
		.createInstance(Components.interfaces.nsIFileOutputStream);
	var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
		.createInstance(Components.interfaces.nsIConverterOutputStream);

	stream.init(filepointer, 0x02 | 0x08 | 0x20, 0777, 0);
	converter.init(stream, 'utf-8', data.length, Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
	
	converter.writeString(data);
	
	converter.close();
	stream.close();
};



//read data from a file
//returning an empty string if the file doesn't exist
//or the data from the file if it does
DustMeSelectors_filesystem.getFromFile = function(filename)
{
	//create a variable for storing the read data
	//initially empty, which we'll return if we find no data
	var data = '';

	//initialize a file pointer with the given name
	var filepointer = this.initFilePointer(filename);

	//try to initialize the input stream, then read the data through a convertor stream and close it again
	//nb. we have to use a convertor stream so that we can handle utf-8 characters in the file
	//nb. use exception handling in case the specified file doens't exist
	try
	{
		var stream = Components.classes["@mozilla.org/network/file-input-stream;1"]
			.createInstance(Components.interfaces.nsIFileInputStream);
		var convertor = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
			.createInstance(Components.interfaces.nsIConverterInputStream);
		
		stream.init(filepointer, -1, 0, 0);
		convertor.init(stream, 'utf-8', 0, 0);

		var str = {}, read = 0;
		do 
		{ 
			read = convertor.readString(0xffffffff, str);
			data += str.value;
		} 
		while(read != 0);
		
		convertor.close();		
	}

	//if we fail, do nothing, so we end up returning an empty string
	catch(ex){}

	//return the data
	return data;
};



//move a file with the given name to the trash folder
//** should we worry about overwriting data in the trash?
//** or do something like add a timestamp to deleted files
DustMeSelectors_filesystem.moveToTrash = function(filename)
{
	//do this on a try catch for when the file doesn't exist
	//for eg, when trying to delete log file if site hasn't been spidered
	//could have done some kind of other detection, but this is easier :)
	try
	{
		var filepointer = this.initFilePointer(filename);
		filepointer.moveTo(this.trashpointer, filename);
	}
	catch(err) {}
};



//export selectors or log data to a file in the selected format
DustMeSelectors_filesystem.exportToFile = function(viewdoc, type)
{
	//get the selected tab in the tabbrowser
	var tab = viewdoc.getElementById('dms-viewtabs').selectedItem;
	
	//save a reference to the hosts menu, then get the selected 
	//host key (eg. selectors.localhost) and host label (the full host url)
	var 
	menu = viewdoc.getElementById('dms-hostsindexmenu'),
	hostkey = menu.selectedItem.getAttribute('value'),
	hostlabel = menu.selectedItem.getAttribute('label');
	
	//now get the appropriate data according to the selected tab
	//returning null in each case if there is no data
	//and along the way store the datatype in a convenient form
	switch(tab.id)
	{
		//the selectors tab
		case 'dms-viewtab-selectors' :

			var 
			data = DustMeSelectors_tools.getDataObject(hostkey, 'selectors', null),
			datatype = 'selectors';
			break;

		//the used selectors tab
		case 'dms-viewtab-used' :

			var 
			data = DustMeSelectors_tools.getDataObject(hostkey, 'used', null),
			datatype = 'used';
			break;

		//the spider log tab
		case 'dms-viewtab-spider' :

			var 
			data = DustMeSelectors_tools.getDataObject(hostkey, 'log', null),
			datatype = 'log';
			break;
	}
	

	//create a file picker interface and initialise as a "save" dialog
	//nb. based on: http://developer.mozilla.org/en/docs/XUL_Tutorial:Open_and_Save_Dialogs
	var nsIFilePicker = Components.interfaces.nsIFilePicker;
	var filepointer = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	filepointer.init(DustMeSelectors_browser.viewdialog, 
		DustMeSelectors_tools.bundle.getString('view.save')
			.replace('%1', tab.getAttribute('label').toLowerCase()), 
		nsIFilePicker.modeSave);

	//specify the type filter according to the type argument
	switch(type)
	{
		//export json
		case 'json' : 
			filepointer.appendFilter(DustMeSelectors_tools.bundle.getString('view.json'), '*.json; *.js');
			break;

		//export csv by default
		default : 
			filepointer.appendFilter(DustMeSelectors_tools.bundle.getString('view.csv'), '*.csv; *.txt');
			break;
	}
	
	//set the default file name to host + type + extension
	//nb. don't use the literal datatype because that says "selectors" or "used"
	//which is a legacy hangover from before we listed used rules at all
	//also change the global preference name from "selectors" to "@global"
	//so it matches the local files host name (which is @local)
	//and doesn't create confusing file names like "selectors.log.csv"
	filepointer.defaultString = 
		(hostkey == 'selectors' ? '@global' : hostkey.replace(/^selectors\./, ''))
		+ '.' 
		+ (datatype == 'selectors' ? 'unused' : datatype)
		+ '.' 
		+ type;
	
	//now open the dialog and save its result, then if the result was not cancel
	var result = filepointer.show();
	if(result != nsIFilePicker.returnCancel)
	{
		//remove any extensions from the end of the file name
		//then add the expected extension back (in case it was missing)
		//** but if they selected the file for replace (ie. so it said "foo") 
		//** when both "foo" and "foo.csv" existed, the confirmation will apply to 
		//** "foo" and not "foo.csv", so we'll have bypassed confirmation and end up
		//** overwriting a different file; that's not so likely to happen though 
		//** (as noted earlier), and even if it does, it would only be a problem 
		//** if the user was not expecting "foo.css" to be ovewritten (as it will be)
		//** update: it seems that this problem only affects the mac, not windows, 
		//** however in windows we can't update the leafName, it seems to be readonly
		//** which is why we had to convert the function to only have one type in the save dialog
		filepointer.file.leafName = filepointer.file.leafName.replace(/(\.(csv|txt|json|js))?$/g, '');
		filepointer.file.leafName += '.' + type;

		//now switch by type filter to convert the data to output text 
		switch(type)
		{
			//get json
			case 'json' : 
				var filedata = DustMeSelectors_filesystem.getJSON(data, datatype, hostlabel);
				break;

			//get csv by default
			default : 
				var filedata = DustMeSelectors_filesystem.getCSV(data, datatype, hostlabel);
				break;
		}
		
		//save the filepointer reference and filedata to temporary global properties
		DustMeSelectors_filesystem.filepointer = filepointer;
		DustMeSelectors_filesystem.filedata = filedata;
		
		//also define an onfilesaved callback function 
		//to show the viewinfo saved icon, which has a tooltip with an 
		//onpopuphidden event, so it re-hides the icon after you've seen the tooltip :-)
		//however the user might have seen it before, so hide it anyway after 7 seconds
		//but first clear any instance of the timer that might still be running
		DustMeSelectors_filesystem.onfilesaved = function()
		{
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
		};
		
		//then check to see if a file already exists with that name 
		//but only if the dialog didn't returnReplace, which would happen 
		//if the user manually typed the extension for a file which already existed
		//** but if they selected the file for replace (ie. so it said "foo") 
		//** when both "foo" and "foo.csv" existed, the confirmation will apply to 
		//** "foo" and not "foo.csv", so we'll have bypassed confirmation and end up
		//** overwriting a different file; that's not so likely to happen though 
		//** (as noted earlier), and even if it does, it would only be a problem 
		//** if the user was not expecting "foo.csv" to be ovewritten (as it will be)
		//** update: it seems that this problem only affects the mac, not windows, 
		//** however in windows we can't update the leafName, it seems to be readonly
		//** which is why we had to convert the function to only have one type in the save dialog
		var testpointer = Components.classes["@mozilla.org/file/local;1"]
							.createInstance(Components.interfaces.nsIFile);
		testpointer.initWithFile(filepointer.file);
		if(result != nsIFilePicker.returnReplace && testpointer.exists())
		{
			//show a confirmation dialog, which will then do the file write if confirmed
			//NOTE FOR REVIEWERS: the query value will never contain a remote URI
			DustMeSelectors_browser.viewdialog.openDialog('chrome://dustmeselectors/content/saveconfirm.xul?text='
				+ encodeURI(DustMeSelectors_tools.bundle.getString('view.save.confirm')
							.replace('%1', filepointer.file.leafName)),
				'errdialog', 'chrome,centerscreen,modal,resizable=no');
		}
		
		//else proceed straight to confirmed file write
		else
		{
			DustMeSelectors_filesystem.doConfirmedSave();
		}
	}
};



//save cleaned csstext to a file 
DustMeSelectors_filesystem.saveCleanedStylesheet = function(filename, filedata, onfilesaved)
{
	//create a file picker interface and initialise as a "save" dialog
	var nsIFilePicker = Components.interfaces.nsIFilePicker;
	var filepointer = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	filepointer.init(DustMeSelectors_browser.viewdialog, 
		DustMeSelectors_tools.bundle.getString('view.cleaning.save'), 
		nsIFilePicker.modeSave);
	
	//specify CSS as the only type filter
	filepointer.appendFilter(DustMeSelectors_tools.bundle.getString('view.cleaning.css'), '*.css');

	//set the default filename
	filepointer.defaultString = filename;

	//now open the dialog and save its result, then if the result was not cancel
	var result = filepointer.show();
	if(result != nsIFilePicker.returnCancel)
	{
		//remove any extensions from the end of the file name
		//then add the expected extension back (in case it was missing)
		//** but if they selected the file for replace (ie. so it said "foo") 
		//** when both "foo" and "foo.css" existed, the confirmation will apply to 
		//** "foo" and not "foo.css", so we'll have bypassed confirmation and end up
		//** overwriting a different file; that's not so likely to happen though 
		//** (as noted earlier), and even if it does, it would only be a problem 
		//** if the user was not expecting "foo.css" to be ovewritten (as it will be)
		//** update: it seems that this problem only affects the mac, not windows, 
		//** however in windows we can't update the leafName, it seems to be readonly
		//** so in this case it all works out fine since we only have one extension
		filepointer.file.leafName = filepointer.file.leafName.replace(/((?:\.[\w]+)*)$/, '');
		var ext = DustMeSelectors_preferences.getPreference('string', 'cleanedfilename').split('.');
		filepointer.file.leafName += '.' + ext.pop();
		
		//save the filepointer reference and filedata to temporary global properties
		DustMeSelectors_filesystem.filepointer = filepointer;
		DustMeSelectors_filesystem.filedata = filedata;
		
		//also save the onfilesaved callback reference, if one is defined
		//so that the confirmed save can report back to the original caller
		if(typeof onfilesaved == 'function')
		{
			DustMeSelectors_filesystem.onfilesaved = onfilesaved;
		}

		//then check to see if a file already exists with that name 
		//but only if the dialog didn't returnReplace (as noted earlier)
		var testpointer = Components.classes["@mozilla.org/file/local;1"]
							.createInstance(Components.interfaces.nsIFile);
		testpointer.initWithFile(filepointer.file);
		if(result != nsIFilePicker.returnReplace && testpointer.exists())
		{
			//show a confirmation dialog, which will then do the file write if confirmed
			//NOTE FOR REVIEWERS: the query value will never contain a remote URI
			DustMeSelectors_browser.viewdialog.openDialog('chrome://dustmeselectors/content/saveconfirm.xul?text='
				+ encodeURI(DustMeSelectors_tools.bundle.getString('view.save.confirm')
							.replace('%1', filepointer.file.leafName)),
				'errdialog', 'chrome,centerscreen,modal,resizable=no');
		}
		
		//else proceed straight to confirmed file write
		else
		{
			DustMeSelectors_filesystem.doConfirmedSave();
		}
	}
};




//do an actual file write after getting any necessary overwrite confirmation
DustMeSelectors_filesystem.doConfirmedSave = function()
{
	//jic!
	if(!(DustMeSelectors_filesystem.filepointer && DustMeSelectors_filesystem.filedata)) { return; }
	
	//open and initialize the file stream (write | create | truncate) with full permissions
	var stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
					.createInstance(Components.interfaces['nsIFileOutputStream']);
	stream.init(DustMeSelectors_filesystem.filepointer.file, 0x02 | 0x08 | 0x20, 0777, 0);

	/**
	//pass that through a converter stream so the output is always utf-8
	//*** except that it doesn't seem to make any difference! actually I can't 
	//*** fathom what's going on -- sometimes it saves as utf-8 and sometimes as latin-1
	//*** both of which have happened with and without this converter stream, and with 
	//*** original data that has different or the same encoding, so fuck knows wtf!
	var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
					.createInstance(Components.interfaces.nsIConverterOutputStream);
	converter.init(stream, 'utf-8', DustMeSelectors_filesystem.filedata.length, 
		Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
	
	//then write the data and close both streams
	converter.writeString(DustMeSelectors_filesystem.filedata);
	converter.close();
	stream.close();
	**/

	//then write the text and close the stream again
	stream.write(DustMeSelectors_filesystem.filedata, DustMeSelectors_filesystem.filedata.length);
	stream.close();
	
	//** save the current display directory for next time
	//** (except sometimes that happens anyway ... and sometimes not,
	//**  and there's nothing I can think of to explain why/not!)

	//if we have an onfilesaved callback, call it now
	if(typeof DustMeSelectors_filesystem.onfilesaved == 'function')
	{
		DustMeSelectors_filesystem.onfilesaved();
	}
	
	//nullify the filepointer, filedata and onfilesaved references
	DustMeSelectors_filesystem.filepointer = null;
	DustMeSelectors_filesystem.filedata = null;
	DustMeSelectors_filesystem.onfilesaved = null;
};




//convert selectors or log data to CSV
//nb. using CRLF line-breaks for safety, because some windows applications 
//can't handle LF but afaik all unix applications can handle CRLF
DustMeSelectors_filesystem.getCSV = function(data, datatype, hostlabel)
{
	//if this is log information 
	if(datatype == 'log')
	{
		//if the data is null, output the not spidered message
		//but do it in a row that lists the domain root (where the sitmap address would be)
		//and then the message (where the spider summary would be)
		//nb. convert the unicode curly-apostrophe to a normal one
		//because the escape sequence doesn't survive to output
		if(data == null)
		{
			var spreadsheet = '"http://' 
							+ hostlabel
							+ '/","'
							+ DustMeSelectors_tools.bundle.getString('spider.nolog').replace(/\u2019/g, "'")
							+ '"\r\n';
		}

		//otherwise build two spreadsheet columns starting with the baseurl and summary, 
		//then the redirection information if applicable, then an extra linebreak
		//add quote characters around each value in case it contains commas
		else
		{
			spreadsheet = '"' + data.baseurl 
				+ (data.summary == 'incomplete'
					? (' ' + DustMeSelectors_tools.bundle.getString('spider.incomplete'))
					: '')
				+ '","' 
				+ DustMeSelectors_tools.bundle
					.getString('spider.logsummary')
					.replace('%1', data.pages)
					.replace('%2', (data.files - data.pages == 0 ? DustMeSelectors_tools.bundle.getString('view.no') : (data.files - data.pages)))
					.replace('%P1', (data.pages == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
					.replace('%P2', (data.files - data.pages == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
					.replace('%P3', DustMeSelectors_tools.bundle.getString('spider.scope.' + data.summary))
				+ '"'
				+ (typeof data.sourceurl != 'undefined' && data.sourceurl !== null
					? ('\r\n"' + DustMeSelectors_tools.bundle.getString('spider.redirected').replace('%1', data.sourceurl) + '",')
					: '')
				+ '\r\n,\r\n';
				
			//then add a line for each spidered URL, still adding quotes
			//remembering to URI decode them, since they're stored encoded
			for(var i in data)
			{
				if(!data.hasOwnProperty(i) || (/^(pages|files|summary|baseurl|sourceurl)$/.test(i))) { continue; }
				
				spreadsheet += '"' + decodeURIComponent(i) + '",';
				if(data[i].message)
				{
					spreadsheet += '"' + data[i].message + '"';
				}
				else if(data[i].status != null)
				{
					spreadsheet += '"' + DustMeSelectors_tools.bundle.getString('spider.checked') + '"';
				}
				spreadsheet += '\r\n';
			}
		}
	}
	
	//else for un/used selectors information
	else
	{
		//if the data is null, output the no stylesheets message
		if(data == null)
		{
			spreadsheet = '"' + DustMeSelectors_tools.bundle.getString('view.none') + '"';
		}
		
		//otherwise, to compile the data data into CSV text
		//first define a matrix that represents the amount of data 2D
		//along the way, rekey the nested objects
		//create a single-member nested object out of string members
		//and store the "no unused" or "no used" message as a single-member to empty nested objects
		else
		{
			var matrix = [];
			for(var i in data)
			{
				if(!data.hasOwnProperty(i)) { continue; }
				var n = 0;
				//if this member is a string message
				//(such as "no unused selectors")
				if(typeof data[i] == 'string')
				{
					//convert this member to an object
					//and store the string as its message property
					data[i] = { 'msg' : data[i] };
				}
				//otherwise it's an object of selectors
				else
				{
					//rekey the object then count it
					data[i] = DustMeSelectors.rekey(data[i]);
					n = DustMeSelectors_tools.count(data[i]);
					
					//if we have no data store the okay message
					//and add one to the count so it gets output
					if(n == 0)
					{
						data[i] = { 
							'msg' : DustMeSelectors_tools.bundle
									.getString('view.' + (datatype == 'used' ? 'noused' : 'okay')) 
							};
						n++;
					}
		
					//otherwise rekey again to allow for deleted data
					//** don't think this is necessary anymore
					else
					{
						data[i] = DustMeSelectors.rekey(data[i]);
					}
				}
				matrix.push(n);
			}
		
			//now sort the matrix to find the largest one
			matrix = matrix.sort(function(a, b){ return b - a; });
		
			//then iterate that many times (from -3 to include the headers, message and space rows)
			//and internally iterate on data to build the spreadsheet columns
			spreadsheet = '';
			for(i=-3; i<matrix[0]; i++)
			{
				var line = '';
				for(j in data)
				{
					if(!data.hasOwnProperty(j)) { continue; }
					//url headers
					if(i == -3)
					{
						//add quote characters around the value in case it contains commas
						//and remember to URI decode it, since it's stored encoded
						//including an extra column to allow for selector line numbers
						line += '"' + decodeURIComponent(j) + '",""';
					}
					//summary/message
					else if(i == -2)
					{
						//add error message if applicable
						//add quote characters around every value in case it contains commas
						//including an extra column to allow for selector line numbers
						if(typeof data[j]['msg'] != 'undefined')
						{
							line += '"' + data[j]['msg'] + '",""';
						}
						//otherwise add redundent rule count
						//including an extra column to allow for selector line numbers
						else
						{
							var n = 0;
							for(var k in data[j])
							{
								if(!data[j].hasOwnProperty(k)) { continue; }
								n++;
							}
							line += '"'
									+ DustMeSelectors_tools.bundle
										.getString('view.' + (datatype == 'used' ? 'used' : 'warning'))
										.replace('%1', n)
										.replace('%P1', (n == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
									+ '",""';
						}
					}
					//selector and line number (or empty column if we have no line number)
					//nb. the line number appears to the right of the selector, rather than 
					//to the left (as might be more obvious) for consistency with view dialog data
					else if(i >= 0 && typeof data[j][i.toString()] != 'undefined')
					{
						//nb. don't add quotes as it would break parsing for things like [foo="bar"]
						//we don't need them anyway because they're just for cases where 
						//the value might contain a comma, which doesn't apply to selectors
						//** except perhaps an attribute value like [foo="1,2,3"]
						//** so I did try escaping internal quotes and then adding surrounding quotes, 
						//** but the test CSV parsing I did (in open office) couldn't handle that
						var tmp = data[j][i.toString()].split('{');
						line += tmp[0] + ',' + (tmp.length == 1 ? '' : parseInt(tmp[1], 10).toString());
					}
					else 
					{ 
						line += ','; 
					}
					line += ',';
				}
				line = line.substring(0, line.length - 1);
				spreadsheet += line + '\r\n';
			}
		}
	}

	//finally return the csv data
	return spreadsheet;
};


//convert selectors or log data to JSON 
DustMeSelectors_filesystem.getJSON = function(data, datatype, hostlabel)
{
	//define an empty object to compile the output into
	//with a top-level object named according to the datatype
	//ie. unused data returns an object with a single "unused" object inside it
	var key, dictionary = {};
	dictionary[(key = datatype == 'selectors' ? 'unused' : datatype)] = {};
	
	//if this is log information 
	if(datatype == 'log')
	{
		//if the data is null
		if(data == null)
		{
			//define the domain root as the sitemap "url"
			//and the not-spidered message as the log "summary" 
			//nb. convert the unicode curly-apostrophe to a normal one
			//because the escape sequence doesn't survive to output (** why not? **)
			dictionary[key].url = 'http://' + hostlabel + '/';
			dictionary[key].summary = DustMeSelectors_tools.bundle.getString('spider.nolog').replace(/\u2019/g, "'");
		}
		
		//else if we have log data
		else
		{
			//define the sitemap "url" 
			dictionary[key].url = data.baseurl;
			
			//if the sitemap was redirected, define the "redirection" url
			if(typeof data.sourceurl != 'undefined' && data.sourceurl !== null)
			{
				dictionary[key].redirection = data.sourceurl;
			}

			//define the "summary" message 
			dictionary[key].summary = DustMeSelectors_tools.bundle
				.getString('spider.logsummary')
				.replace('%1', data.pages)
				.replace('%2', (data.files - data.pages == 0 ? DustMeSelectors_tools.bundle.getString('view.no') : (data.files - data.pages)))
				.replace('%P1', (data.pages == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
				.replace('%P2', (data.files - data.pages == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')))
				.replace('%P3', DustMeSelectors_tools.bundle.getString('spider.scope.' + data.summary));
		
			//define the "complete" flag according to the status
			dictionary[key].complete = data.summary != 'incomplete';
			
			//now define the "pages" array
			dictionary[key].pages = [];
			
			//then iterate through the log data to create each page's entry
			for(var i in data)
			{
				if(!data.hasOwnProperty(i) || (/^(pages|files|summary|baseurl|sourceurl)$/.test(i))) { continue; }
			
				//create this single page array with the initial "url" 
				var page = { url : decodeURIComponent(i) };
				
				//if the entry has a message when it's status is "checked"
				//then the message refers to a page redirection, 
				//so extract the "redirection" url and set the "summary" to OK
				if(data[i].message && data[i].status == 'checked')
				{
					page.redirection = data[i].message
						.replace(DustMeSelectors_tools.bundle.getString('spider.redirected').replace('%1', ''), '')
						.replace(/^\s+|\s+$/g, '');
					page.summary = DustMeSelectors_tools.bundle.getString('spider.checked');
				}
				
				//else if the entry has a message when it's status is "notchecked"
				//then set the "summary" to the message
				else if(data[i].message && data[i].status == 'notchecked')
				{
					page.summary = data[i].message;
				}
				
				//else if the entry has a status then set the "summary" to OK
				//nb. if it doesn't have a status then it hasn't been checked yet
				//so we don't define a "summary" property at all, to indicate that
				else if(data[i].status !== null)
				{
					page.summary = DustMeSelectors_tools.bundle.getString('spider.checked');
				}
				
				//then add this page to the pages array
				dictionary[key].pages.push(page);
			}
		}
	}
	
	//else for un/used selectors information
	else
	{
		//if the data is null, re-define the object to the no-stylesheets message
		if(data == null)
		{
			dictionary[key] = DustMeSelectors_tools.bundle.getString('view.none');
		}
		
		//else if we have selectors data
		else
		{
			//re-define the object to the stylesheet groups array
			dictionary[key] = [];

			//then iterate through the data to define each member
			for(var i in data)
			{
				if(!data.hasOwnProperty(i)) { continue; }
			
				//define this stylesheet group object with the initial "url"
				//nb. if this was an inline styleblock then 
				//the url we get will include its node pointer 
				var group = { url : decodeURIComponent(i) };

				//if this member is a string message (such as "no unused selectors")
				if(typeof data[i] == 'string')
				{
					//set the group "summary" to the message
					group.summary = data[i];
				}
				
				//else if it's a normal stylesheet group
				else
				{
					//rekey the object then count it
					data[i] = DustMeSelectors.rekey(data[i]);
					n = DustMeSelectors_tools.count(data[i]);

					//if we have no selectors data 
					if(n == 0)
					{
						//define the group "summary"with the 
						//noused or okay message, as applicable to type
						group.summary = DustMeSelectors_tools.bundle.getString
										('view.' + (datatype == 'used' ? 'noused' : 'okay'));
					
						//then define an empty "selectors" array 
						//so you can differentiate this from error groups
						group.selectors = [];
					}
					
					//else if we do have selectors data
					else
					{
						//define the group "summary" with the 
						//used or warning message, as applicable to type
						group.summary = DustMeSelectors_tools.bundle
							.getString('view.' + (datatype == 'used' ? 'used' : 'warning'))
							.replace('%1', n)
							.replace('%P1', (n == 1 ? '' : DustMeSelectors_tools.bundle.getString('view.plural')));

						//define a selectors array
						var selectors = [];
						
						//now iterate through the selectors in this group
						for(var j in data[i])
						{
							if(!data[i].hasOwnProperty(j)) { continue; }
							
							//define a selector object with the "selector" text 
							//and "line" number (if defined) then add it to the selectors array
							//nb. we can rely on JSON encoding to do any necessary escaping
							var tmp = data[i][j].split('{');
							var selector = { selector : tmp[0] };
							if(tmp.length > 1)
							{
								var lineCol = tmp[1].split(':');
								selector.line = parseInt(lineCol[0], 10);
								selector.column = lineCol.length > 1 ? parseInt(lineCol[1], 10) : null
							}
							selectors.push(selector);
						}
						
						//then save the "selectors" array to the group object
						group.selectors = selectors;
					}
				}
				
				//then add this group to the main array
				dictionary[key].push(group);
			}
		}
	}
	
	//finally stringify and return the json data
	return DustMeSelectors_tools.Object_toJSONString(dictionary) + '\r\n';
};

