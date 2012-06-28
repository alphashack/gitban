var LBL_BACKLOG = 'GB0 - Backlog';
var LBL_READY = 'GB1 - Ready';
var LBL_DOING = 'GB2 - Doing';
var LBL_UNTRACKED = 'GB99';

var LABELS = [LBL_DOING, LBL_READY, LBL_BACKLOG, LBL_UNTRACKED];

var _gh = require('github');
var _api =  new _gh({ version: "3.0.0"});
var _prg = require('commander');
var _fs = require('fs');

loadDefaults();

_prg
    .version('0.0.1')
    .option('-u, --user <username>', 'login user name')
    .option('-p, --pass <password>', 'login password')
    .option('-r, --repo <repository>', 'repository for issues')
    .option('-o, --org <organization>', 'organization')
    .option('-a, --assignee <assignee>', 'assignee or "all" for all users, default is login user');

_prg
    .command('status')
    .description('Display what each team member is currently doing')
    .action(trapex(report));

_prg
    .command('doing')
        .description('Lists in progress issues')
        .action(trapex(function() { list(LBL_DOING); }));
_prg
    .command('backlog')
        .description('Lists backlog issues')
        .action(trapex(function() { list(LBL_BACKLOG); }));
_prg
    .command('ready')
        .description('Lists ready issues')
        .action(trapex(function() { list(LBL_READY); }));
_prg
    .command('list')
        .description('Lists all issues')
        .action(trapex(list));
_prg
    .command('info #')
    .description('Shows information on issue')
    .action(trapex(info));

_prg
    .command('take #')
    .description('Take ownership of issue')
    .action(trapex(function(num) { take(parseInt(num),false);}));

_prg
    .command('action #')
    .description('Take ownership of issue and put into DOING state (other assigned issues in DOING state will be switched to READY)')
    .action(trapex(function(num) { take(parseInt(num),true);}));

_prg.parse(process.argv);

function loadDefaults()
{
    var home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];

    var path = home + '/.gitban.json';

    try
    {
        _fs.statSync(path);
    }
    catch(ex)
    {
        // Assume no file
        return;
    }

    var settings;
    try
    {
        settings = require(path);
        for(var s in settings)
        {
            _prg[s] = settings[s];
        }
    }
    catch(ex)
    {
        console.log('Unable to use "%s", %s', path, ex);
    }
}

function getAssignee()
{
    return  _prg.assignee ? (_prg.assignee == 'all' ? '*' : _prg.assignee) : _prg.user;
}

function trapex(fnc)
{
    var fnct = fnc;
    return function()
    {
        try
        {
            fnct.apply(null, arguments);
        }
        catch(ex)
        {
            console.log(ex.message);
            process.exit(1);
        }
    }
}

function traperr(fnc)
{
    var fnct = fnc;

    return function(err,res)
    {
        if (err)
        {
            console.log(err.message);
            process.exit(1);
        }
        else
            fnct(res);
    };
}

function pad(s,n)
{
    while(s.length < n)
        s = s + ' ';

    return s;
}

function preamble()
{
    if (!_prg.org)
    {
        console.log('Must specify an organization');
        process.exit(1);
    }

    _api.authenticate({type:'basic',username:_prg.user,password:_prg.pass});
}

function filter(res, label)
{
    return res.filter(function(e)
    {
        return e.labels && e.labels.some(function(e) { return e.name == label;});
    });
}

function issueState(issue)
{
    var state = [LBL_UNTRACKED,'not tracked'];
    if (issue.labels)
        issue.labels.forEach(function(e)
        {
            LABELS.forEach(function(l)
            {
                if (e.name == l)
                    state = [l, l.split(' ')[2]]
            });
        });

    return state;
}

function report()
{
    preamble();

    console.log('Finding issues in progress\n')
    getIssues(null, LBL_DOING, function(res)
    {
        dump(res);
        console.log();
    });

}

function removeState(issue)
{
    if (!issue.labels)
        return;

    issue.labels = issue.labels.filter(function(e)
    {
        return LABELS.indexOf(e.name) == -1;
    });

    return issue.labels.map(function(e)
    {
        return e.name;
    });
}

function dumpIssue(issue)
{
    console.log('==> #%s - %s - %s - %s', pad(issue.number+'',4), pad(issue.assignee.login,15), pad(issueState(issue)[1],12), issue.title);
}

function info(num)
{
    preamble();

    console.log('Finding info on issue #%d\n', num);

    _api.issues.getRepoIssue({user:_prg.org,repo:_prg.repo,number:num}, traperr(function(issue)
    {
        dumpIssue(issue);
        console.log('\n%s\n',issue.body);

        if (issue.comments > 0)
        {
            _api.issues.getComments({user:_prg.org,repo:_prg.repo,number:num,per_page:100}, traperr(function(comments)
            {
                for(var i=0;i<comments.length;i++)
                {
                    console.log('=> %s said :\n%s\n', comments[i].user.login, comments[i].body);
                }

            }));
        }
    }));
}

function editIssue(issue, assignee, state, comment, cb)
{
    if (typeof issue == 'number')
    {
        _api.issues.getRepoIssue({user:_prg.org,repo:_prg.repo,number:issue}, traperr(function(i)
        {
            issue = i;
            doEdit();
        }));
    }
    else
        doEdit();

    function doEdit()
    {
        var st = issueState(issue);

        var msg = {user:_prg.org,repo:_prg.repo,number:issue.number,title:issue.title};
        if (assignee)
            msg.assignee = assignee;

        if (state)
        {
            var lst = removeState(issue);
            lst.push(state);
            msg.labels = lst;
        }
        else
            msg.labels = issue.labels.map(function(e){ return e.name; });

        _api.issues.edit(msg,traperr(function()
        {
            _api.issues.createComment({user:_prg.org,repo:_prg.repo,number:issue.number,body:'[gitban] ' + comment},traperr(function()
            {
                cb();
            }));
        }));
    }
}

function take(num,fAction)
{
    preamble();

    debugger;

    if (getAssignee() == '*')
    {
        console.log('Cannot have everyone %s issue %d', fAction ? 'action' : 'take', num);
        return;
    }

    console.log('%s issue %d for %s\n', fAction ? 'Actioning' : 'Taking', num, getAssignee());

    if (fAction)
    {
        // We are actioning, make sure other issues are not in progress
        getIssues(getAssignee(), LBL_DOING, function(res)
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
                    console.log();
                    finish();
                }
                else
                {
                    var i = res.shift();

                    if (i.number == num && issueState(i)[0] == LBL_DOING)
                    {
                        console.log('Issue #%d is already being actioned by %s\n', num, getAssignee());
                        return;
                    }

                    console.log('%s is currently doing #%d - "%s", switching this to ready', getAssignee(), i.number, i.title);

                    var comment = 'switching to work on issue #' + num;

                    editIssue(i, null, LBL_READY, comment, function()
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
        editIssue(num, getAssignee(), fAction ? LBL_DOING : LBL_READY, getAssignee() == _prg.user ? 'took' : 'gave to ' + getAssignee(), function()
        {
            console.log('Done\n');
        });
    }
}

function getIssues(assignee,label,cb)
{
    var c = 0;
    var a = [];
    var page = 1;

    doit();

    function doit()
    {
        var msg = {repo:_prg.repo,per_page:100,page:page,assignee:assignee};
        if (_prg.org)
            msg.user = _prg.org;

        _api.issues.repoIssues(msg,traperr(function(res)
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
    preamble();

    var title;
    if (label)
        title = label.split(' ')[2];

    if (title)
        console.log('Finding issues for %s in the %s state\n', getAssignee(), title);
    else
        console.log('Finding all issues assigned to %s\n', getAssignee());

    getIssues(getAssignee(), label, function(a)
    {
        dump(a);
        console.log('\nFound %d issue%s\n', a.length, a.length == 1 ? '' : 's');
    });
}

function dump(lst)
{
    for(var i = 0; i < lst.length; i++)
        lst[i]._state = issueState(lst[i])[0];

    lst.sort(function(a,b)
    {
        if (a._state == b._state)
            return a.number - b.number;
        else
            return LABELS.indexOf(a._state) - LABELS.indexOf(b._state);
    });

    for(var i = 0; i < lst.length; i++)
        dumpIssue(lst[i]);
}