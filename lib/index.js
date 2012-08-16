var _gh = require('github');
var _prg = require('commander');
var _fs = require('fs');
var _ = require('underscore');
var _pjson = require('../package.json');

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

var _api =  new _gh({ version: "3.0.0", log:function()
{
	// Yes node-github, got that error, how about NOT ALWAYS putting it to console
}});

loadDefaults();

_prg
	.version(_pjson.version)
	.option('-u, --user <username>', 'login user name')
	.option('-p, --pass <password>', 'login password')
	.option('-r, --repo <repository>', 'repository for issues')
	.option('-o, --org <organization>', 'organization')
	.option('-t, --token <token>', 'OAuth token to use.  Password is ignored.')
	.option('-c, --comment <comment>', 'Text to append to comment if one is created, or body of issue if creating')
	.option('-a, --assignee <assignee>', 'assignee or "all" for all users, default is login user');

_prg
	.command('status')
	.description('Display what each team member is currently doing')
	.action(trapaction(report));

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
	.description('Shows information on issue')
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

function pad(s, n, ch)
{
	if (!ch)
		ch = ' ';

	while (s.length < n)
		s = s + ch;

	return s;
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

function report()
{
	msg('Finding issues in progress');
	getIssues(null, LBL_DOING, function (res)
	{
		newl();
		dump(res);
		newl();
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

function dumpIssuesHeader(fNoName)
{
	var cp = pad('', COL_PAD);

	if (fNoName)
	{
		msg('%s%s%s%s%s%s%s', pad('#', 4), cp, pad('Pri', 3), cp, pad('State', 12), cp, 'Title');
		msg('%s%s%s%s%s%s%s', pad('', 4, '-'), cp, pad('', 3, '-'), cp, pad('', 12, '-'), cp, pad('', 20, '-'));
	}
	else
	{
		msg('%s%s%s%s%s%s%s%s%s', pad('#', 4), cp, pad('Pri', 3), cp, pad('Assigned', 15), cp, pad('State', 12), cp, 'Title');
		msg('%s%s%s%s%s%s%s%s%s', pad('', 4, '-'), cp, pad('', 3, '-'), cp, pad('', 15, '-'), cp, pad('', 12, '-'), cp, pad('', 20, '-'));
	}
}
function dumpIssue(issue,fNoName)
{
	var cp = pad('', COL_PAD);

	if (fNoName)
	{
		msg('%s%s%s%s%s%s%s', pad(issue.number + '', 4), cp, pad(issue._pri, 3), cp, pad(issueState(issue)[1], 12), cp, issue.title);
	}
	else
	{
		msg('%s%s%s%s%s%s%s%s%s', pad(issue.number + '', 4), cp, pad(issue._pri, 3), cp, pad(issue.assignee ? issue.assignee.login : '', 15), cp, pad(issueState(issue)[1], 12), cp, issue.title);
	}
}

function info(num)
{
	msg('Finding info on issue #%d', num);

	_api.issues.getRepoIssue({user:_prg.org, repo:_prg.repo, number:num}, trapapi(function (issue)
	{
		newl();

		dumpIssue(issue);

		msg('\n%s\n', issue.body);

		if (issue.comments > 0)
		{
			_api.issues.getComments({user:_prg.org, repo:_prg.repo, number:num, per_page:100}, trapapi(function (comments)
			{
				for (var i = 0; i < comments.length; i++)
				{
					msg('=> %s said :\n%s\n', comments[i].user.login, comments[i].body);
				}

			}));
		}
	}));
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
				cb();
			}));
		}));
	}
}

function take(num, fAction)
{
	if (getAssignee() == '*')
	{
		msg('Cannot have everyone %s issue %d', fAction ? 'action' : 'take', num);
		return;
	}

	msg('%s issue %d for %s\n', fAction ? 'Actioning' : 'Taking', num, getAssignee());

	if (fAction)
	{
		// We are actioning, make sure other issues are not in progress
		getIssues(getAssignee(), LBL_DOING, function (res)
		{
			if (res.length == 0)
			{
				finish();
				return;
			}

			doit();

			function doit()
			{
				if (res.length == 0)
				{
					newl();
					finish();
				}
				else
				{
					var i = res.shift();

					if (i.number == num && issueState(i)[0] == LBL_DOING)
					{
						msg('Issue #%d is already being actioned by %s\n', num, getAssignee());
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
		editIssue(num, getAssignee(), fAction ? LBL_DOING : LBL_READY, getAssignee() == _prg.user ? 'took' : 'gave to ' + getAssignee(), function ()
		{
			msg('Done\n');
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
	var fNoName;
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

		fNoName = true;
	}

	getIssues(assignee, label, function (a)
	{
		newl();
		dump(a,fNoName);
		newl();
	});
}

function create(title)
{
	msg('Creating new issue "%s"', title);

	var msg = {title:title, repo:_prg.repo, user:_prg.org, labels:[LBL_BACKLOG]};
	if (_prg.comment)
		msg.body = _prg.comment;

	_api.issues.create(msg, trapapi(function (res)
	{
		msg('Issue #%d created', res.number);
	}));
}

function dump(lst,fNoName)
{
	lst.forEach(function(e)
	{
		e._state = issueState(e)[0];
		e._pri = issuePri(e);
	});

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

	dumpIssuesHeader(fNoName);

	for (var i = 0; i < lst.length; i++)
		dumpIssue(lst[i], fNoName);

	newl();

	msg('Total of %d issue(s) found.', lst.length);
}