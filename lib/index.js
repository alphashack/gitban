var _gh = require('github');
var _prg = require('commander');
var _fs = require('fs');
var _ = require('underscore');
var _moment = require('moment');
var _term = require('node-terminal');
var _string = require('string');
var _pjson = require('../package.json');

var _api =  new _gh({ version: "3.0.0", log:function()
{
	// Yes node-github, got that error, how about NOT ALWAYS putting it to console
}});

_string.clobberPrototype();

var COL_PAD = 2;

var LBL_BACKLOG = 'GB0 - Backlog';
var LBL_READY = 'GB1 - Ready';
var LBL_DOING = 'GB2 - Doing';
var LBL_UNTRACKED = 'GB99';

var LBL_PRI0 = 'GB - Pri0';
var LBL_PRI1 = 'GB - Pri1';
var LBL_PRI2 = 'GB - Pri2';

var LABELS_STATE = [LBL_DOING, LBL_READY, LBL_BACKLOG, LBL_UNTRACKED];
var LABELS_PRI = [LBL_PRI0, LBL_PRI1, LBL_PRI2];

var FMT_DEFAULT =
	[
		['num',-4],
		['pri',-3],
		['state',15],
		['name','20'],
		['title',20]
	];

var FMT_INFO =
	[
		['num',-4],
		['mstone','15'],
		['pri',-3],
		['state',15],
		['name','20'],
		['title',20]
	];

var FMT_NONAME =
	[
		['num',-4],
		['pri',-3],
		['state',15],
		['title',20]
	];

var FMT_REPORT =
	[
		['num',-4],
		['mstone','15'],
		['pri',-3],
		['name','20'],
		['title',20]
	];

var FMT_REPORT_WORK =
	[
		['num',-4],
		['mstone','15'],
		['pri',-3],
		['name','20'],
		['work','15'],
		['title',20]
	];

loadDefaults();

_prg
	.version(_pjson.version)
	.option('-u, --user <username>', 'login user name')
	.option('-p, --pass <password>', 'login password')
	.option('-r, --repo <repository>', 'repository for issues')
	.option('-o, --org <organization>', 'organization')
	.option('-t, --token <token>', 'OAuth token to use.  Password is ignored.')
	.option('-c, --comment <comment>', 'Text to append to comment if one is created, or body of issue if creating')
	.option('-a, --assignee <assignee>', 'assignee or "all" for all users, default is login user')
	.option('-x, --debugjson', 'Dumps raw JSON for issues if availabled');

_prg
	.command('status')
	.description('Display what each team member is currently doing')
	.option('-w, --work', 'Displays approx. work time spent')
	.action(function(cmd)
	{
		trapaction(function()
		{
			report(cmd.work);
		})();
	});

_prg
	.command('doing')
	.description('Lists in progress issues')
	.action(trapaction(function ()
{
	list(LBL_DOING);
}));

_prg
	.command('backlog')
	.description('Lists backlog issues')
	.action(trapaction(function ()
{
	list(LBL_BACKLOG);
}));

_prg
	.command('ready')
	.description('Lists ready issues')
	.action(trapaction(function ()
{
	list(LBL_READY);
}));

_prg
	.command('list')
	.description('Lists all issues')
	.action(trapaction(function() { list() }));

_prg
	.command('info #')
	.description('Shows information on issue.  If no issue specified then shows information on issue you are currently doing.')
	.action(trapaction(info));

_prg
	.command('take #')
	.description('Take ownership of issue')
	.action(trapaction(function (num)
{
	take(parseInt(num), false);
}));

_prg
	.command('create [title]')
	.description('Creates a new issue, will be unassigned and in the backlog state')
	.action(trapaction(function (title)
{
	create(title);
}));

_prg
	.command('action #')
	.description('Take ownership of issue and put into DOING state (other assigned issues in DOING state will be switched to READY)')
	.action(trapaction(function (num)
{
	take(parseInt(num), true);
}));

_prg
	.command('team')
	.description('Lists the team members')
	.action(trapaction(team));

_prg.parse(process.argv);

function loadDefaults()
{
	var home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];

	var path = home + '/.gitban.json';

	try
	{
		_fs.statSync(path);
	}
	catch (ex)
	{
		// Assume no file
		return;
	}

	var settings;
	try
	{
		settings = require(path);
		for (var s in settings)
		{
			_prg[s] = settings[s];
		}
	}
	catch (ex)
	{
		msg('Unable to use "%s", %s', path, ex);
	}
}

function msg()
{
	console.log.apply(null, arguments);
}

function newl()
{
	console.log();
}

function getAssignee()
{
	return  _prg.assignee ? (_prg.assignee == 'all' ? '*' : _prg.assignee) : _prg.user;
}

function isAssigneeAll(a)
{
	return a == '*';
}

function trapaction(fnc)
{
	var fnct = fnc;
	return function ()
	{
		try
		{
			preamble();
			fnct.apply(null, arguments);
		}
		catch (ex)
		{
			msg(ex.message);
			process.exit(1);
		}
	}
}

function trapapi(fnc)
{
	var fnct = fnc;

	return function (err, res)
	{
		if (err)
		{
			// try to parse
			var msg;
			try
			{
				msg = (JSON.parse(err.message)).message;
			}
			catch(ex)
			{
				msg = err.message;
			}

			console.error('Error: %s', msg);
			process.exit(1);
		}
		else
			fnct(res);
	};
}

function preamble()
{
	if (!_prg.org)
	{
		msg('Must specify an organization');
		process.exit(1);
	}

	if (_prg.token)
		_api.authenticate({type:'oauth', token:_prg.token});
	else
		_api.authenticate({type:'basic', username:_prg.user, password:_prg.pass});
}

function filter(res, label)
{
	return res.filter(function (e)
	{
		return e.labels && e.labels.some(function (e)
		{
			return e.name == label;
		});
	});
}

function issueState(issue)
{
	var state = [LBL_UNTRACKED, 'not tracked'];
	if (issue.labels)
	{
		_.find(issue.labels, function(e)
		{
			var lbl = _.find(LABELS_STATE, function(l) { return e.name == l; });
			if (lbl)
			{
				state = [lbl, lbl.split(' ')[2]];
				return true;
			}
		});
	}

	return state;
}

function issuePriNum(pri)
{
	if (pri == 'n/a')
		return Number.MAX_VALUE;
	else
		return parseInt(pri);
}

function issuePri(issue)
{
	var pri = 'n/a';

	if (issue.labels)
	{
		_.find(issue.labels, function(e)
		{
			var lbl = _.find(LABELS_PRI, function(l) { return e.name == l; });
			if (lbl)
			{
				pri = lbl.substr(lbl.length-1,1);
				return true;
			}
		});
	}

	return pri;
}

function commentIsTook(c)
{
	if (!c || !c.body)
		return false;

	return c.body.startsWith('[gitban] took');
}
function commentIsSwitching(c)
{
	if (!c || !c.body)
		return false;

	return c.body.startsWith('[gitban] switching to');
}

function report(fWork)
{
	debugger;
	msg('Finding issues in progress' + (fWork ? ' along with time spent on each' : ''));

	getIssues(null, LBL_DOING, function (res)
	{
		// Calc work if needed
		if (fWork)
		{
			var i = 0;

			doit();

			function doit()
			{
				if (i >= res.length)
				{
					finish();
					return;
				}

				var issue = res[i++];

				if (issue.comments > 0)
				{
					_api.issues.getComments({user:_prg.org, repo:_prg.repo, number:issue.number, per_page:100}, trapapi(function (comments)
					{
						var userwork = {};
						var usercur;
						var tookcur;
						for (var i = 0; i < comments.length; i++)
						{
							var c = comments[i];

							var updated_at = new Date(c.updated_at).getTime();

							if (commentIsTook(c))
							{
								if (c.user.login != usercur)
								{
									if (usercur)
										userwork[usercur] += (updated_at - tookcur);

									if (!(c.user.login in userwork))
										userwork[c.user.login] = 0;

									usercur = c.user.login;
									tookcur = updated_at;
								}
							}
							else if (commentIsSwitching(c))
							{
								// **should** always be the case but check anyway
								if (c.user.login == usercur)
								{
									userwork[usercur] += (updated_at - tookcur);

									usercur = null;
									tookcur = null;
								}
							}
						}

						if (usercur)
							userwork[usercur] += Date.now() - tookcur;

						issue._work = _moment.duration(userwork[issue.assignee.login]).humanize();
						process.nextTick(doit);
					}));
				}
				else
				{
					issue._work = '(none)';
					process.nextTick(doit);
				}

			}
		}
		else
			finish();

		function finish()
		{
			newl();
			dump(res, fWork ? FMT_REPORT_WORK : FMT_REPORT);
			newl();
		}
	});

}

function team(cmd)
{
	msg('Finding team members');

	_api.orgs.getMembers({org:_prg.org, per_page:100}, trapapi(function (members)
	{
		newl();

		members.forEach(function(e)
		{
			msg(e.login);
		});

		newl();

		msg('Total of %d user(s) found.', members.length);

		newl();
	}));
}

function removeState(issue)
{
	if (!issue.labels)
		return;

	issue.labels = issue.labels.filter(function (e)
	{
		return LABELS_STATE.indexOf(e.name) == -1;
	});

	return issue.labels.map(function (e)
	{
		return e.name;
	});
}

/****************************************
 *
 * @param s				string to pad
 * @param n				amount to pad, negative for right align
 * @param ch			character to pad with, space is default
 */
function pad(s, n, ch)
{
	if (!ch)
		ch = ' ';

	var space = '';
	var l = Math.abs(n) - s.length;
	while (l-- > 0)
		space += ch;

	return n > 0 ? (s + space) : (space + s);
}


/****************************************
 *
 * Returns [val,title]
 */
function issueProp(issue, colname)
{
	switch(colname)
	{
		case 'num':
			return [issue ? issue.number + '' : null, '#'];
		case 'pri':
			return [issue ? issue._pri : null, 'Pri'];
		case 'state':
			return [issue ? issueState(issue)[1] : null, 'State'];
		case 'name':
			return [issue ? (issue.assignee ? issue.assignee.login : '(unassigned)')  : null, 'Assigned'];
		case 'title':
			return [issue ? ((issue.state == 'closed' ? '(closed) ' : '') + issue.title)  : null, 'Title'];
		case 'mstone':
			return [issue ? (issue.milestone ? issue.milestone.title : '(none)') : null, 'Milestone'];
		case 'work':
			return [issue ? issue._work : null, 'Time spent'];
		default:
			return ['?','?'];
	}
}

function dumpIssuesHeader(cols)
{
	var cp = pad('', COL_PAD);

	var txt = '';
	var ln = '';
	for(var i=0;i<cols.length;i++)
	{
		var col = cols[i];

		if (i > 0)
		{
			txt += cp;
			ln += cp;
		}

		txt += pad(issueProp(null, col[0])[1], col[1]);
		ln += pad('', col[1], '-');
	}

	msg(txt);
	msg(ln);
}

/****************************************
 *
 * @param issue
 * @param cols [[<colname>,<width>],...] negative width for right align, cols are:
 *
 * 		num
 * 		pri
 * 		state
 * 		name
 * 		title
 * 		mstone
 */
function dumpIssue(issue,cols)
{
	var cp = pad('', COL_PAD);

	var txt = '';
	for(var i=0;i<cols.length;i++)
	{
		var col = cols[i];

		if (i > 0)
			txt += cp;

		txt += pad(issueProp(issue, col[0])[0], col[1]);
	}

	msg(txt);

	if (_prg.debugjson)
	{
		msg(JSON.stringify(issue,null,3));
		newl();
	}
}

function info(n)
{
	var num;
	var fmt = FMT_INFO;

	if (_.isString(n))
	{
		num = n;

		msg('Finding info on issue #%d', num);

		finish();
	}
	else
	{
		var assignee = getAssignee();

		msg('Finding info on the current issue for %s', assignee);

		fmt = FMT_NONAME;

		getIssues(assignee, LBL_DOING, function (res)
		{
			if (res.length == 0)
			{
				msg('%s does not have an issue currently in progress.', assignee);
				newl();
			}
			else
			{
				num = res[0].number;
				finish();
			}
		});
	}

	function finish()
	{
		_api.issues.getRepoIssue({user:_prg.org, repo:_prg.repo, number:num}, trapapi(function (issue)
		{
			issue._state = issueState(issue)[0];
			issue._pri = issuePri(issue);

			newl();

			dumpIssuesHeader(fmt)
			dumpIssue(issue,fmt);

			msg('\n%s\n', issue.body);

			if (issue.comments > 0)
			{
				_api.issues.getComments({user:_prg.org, repo:_prg.repo, number:num, per_page:100}, trapapi(function (comments)
				{
					for (var i = 0; i < comments.length; i++)
					{
						msg('=> %s %s said :\n%s\n', _moment(comments[i].updated_at).fromNow(),  comments[i].user.login, comments[i].body);
					}

				}));
			}
		}));
	}
}

function editIssue(issue, assignee, state, comment, cb)
{
	if (typeof issue == 'number')
	{
		_api.issues.getRepoIssue({user:_prg.org, repo:_prg.repo, number:issue}, function (err, i)
		{
			if (err)
			{
				msg('Unable to find issue #%d', issue);
				process.exit(1);
			}

			issue = i;
			doEdit();
		});
	}
	else
		doEdit();

	function doEdit()
	{
		var st = issueState(issue);

		var msg = {user:_prg.org, repo:_prg.repo, number:issue.number, title:issue.title};
		if (assignee)
			msg.assignee = assignee;

		if (state)
		{
			var lst = removeState(issue);
			lst.push(state);
			msg.labels = lst;
		}
		else
			msg.labels = issue.labels.map(function (e)
			{
				return e.name;
			});

		_api.issues.edit(msg, trapapi(function ()
		{
			var c = '[gitban] ' + comment;
			if (_prg.comment)
				c += ' - ' + _prg.comment;

			_api.issues.createComment({user:_prg.org, repo:_prg.repo, number:issue.number, body:c}, trapapi(function ()
			{
				cb(issue);
			}));
		}));
	}
}

function take(num, fAction)
{
	var assignee = getAssignee();

	if (isAssigneeAll(assignee))
	{
		msg('Cannot have everyone %s issue %d', fAction ? 'action' : 'take', num);
		return;
	}

	msg('%s issue %d for %s', fAction ? 'Actioning' : 'Taking', num, assignee);

	if (fAction)
	{
		// We are actioning, make sure other issues are not in progress
		getIssues(assignee, LBL_DOING, function (res)
		{
			doit();

			function doit()
			{
				if (res.length == 0)
				{
					finish();
				}
				else
				{
					var i = res.shift();

					if (i.number == num && issueState(i)[0] == LBL_DOING)
					{
						msg('Issue #%d is already being actioned by %s', num, assignee);
						newl();
						return;
					}

					msg('%s is currently doing #%d - "%s", switching this to ready', getAssignee(), i.number, i.title);

					var comment = 'switching to work on issue #' + num;

					editIssue(i, null, LBL_READY, comment, function ()
					{
						process.nextTick(doit);
					});
				}
			}
		});
	}
	else
		finish();

	function finish()
	{
		editIssue(num, assignee, fAction ? LBL_DOING : LBL_READY, assignee == _prg.user ? 'took' : 'gave to ' + assignee, function (issue)
		{
			msg('Issue #%d is now being actioned by %s - "%s"', num, assignee, issue.title);
			newl();
		});
	}
}

function getIssues(assignee, label, cb)
{
	var c = 0;
	var a = [];
	var page = 1;

	doit();

	function doit()
	{
		var msg = {repo:_prg.repo, user:_prg.org, per_page:100, page:page, assignee:assignee};
		if (assignee == "*")
			delete msg[assignee];

		_api.issues.repoIssues(msg, trapapi(function (res)
		{
			if (label)
				res = filter(res, label);

			res.forEach(function(e)
			{
				e._state = issueState(e)[0];
				e._pri = issuePri(e);
			});

			c += res.length;
			if (res.length == 0)
			{
				cb(a);
				return;
			}

			a = a.concat(res);

			page++;
			process.nextTick(doit);
		}));
	}
}

function list(label)
{
	var assignee = getAssignee();

	var state;
	var fmt = FMT_DEFAULT;
	if (label)
		state = label.split(' ')[2];

	if (isAssigneeAll(assignee))
	{
		if (state)
			msg('Finding all issues in the %s state', state);
		else
			msg('Finding all issues');
	}
	else
	{
		if (state)
			msg('Finding issues for %s in the %s state', assignee, state);
		else
			msg('Finding all issues assigned to %s', assignee);

		fmt = FMT_NONAME;
	}

	getIssues(assignee, label, function (a)
	{
		newl();
		dump(a,fmt);
		newl();
	});
}

function create(title)
{
	msg('Creating new issue "%s"', title);

	var params = {title:title, repo:_prg.repo, user:_prg.org, labels:[LBL_BACKLOG]};
	if (_prg.comment)
		params.body = _prg.comment;

	_api.issues.create(params, trapapi(function (res)
	{
		msg('Issue #%d created', res.number);
	}));
}

function dump(lst,fmt)
{
	lst.sort(function (a, b)
	{
		if (a._pri == b._pri)
		{
			if (a._state == b._state)
				return a.number - b.number;
			else
				return LABELS_STATE.indexOf(a._state) - LABELS_STATE.indexOf(b._state);
		}
		else
		{
			return issuePriNum(a._pri) - issuePriNum(b._pri);
		}
	});

	dumpIssuesHeader(fmt);

	for (var i = 0; i < lst.length; i++)
		dumpIssue(lst[i], fmt);

	newl();

	msg('Total of %d issue(s) found.', lst.length);
}