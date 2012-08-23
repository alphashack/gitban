[![build status](https://secure.travis-ci.org/alphashack/gitban.png)](http://travis-ci.org/alphashack/gitban)
gitban
======

*A very simple command line kanban-esque tool for use with github issues*

##Installation

    npm install gitban -g
  
Next, create the following labels in your github project:

GB0 - Backlog  
GB1 - Ready  
GB2 - Doing  

That's it!

##Usage

You can always get help

    gitban --help
    
For most actions you will need to specify:

* github login name
* github password
* organization
* repository

These can be put in a file called *.gitban.json* in your home directory for convenience. The format is:

    {
        "user" : "username",
        "pass" : "password",
        "org" : "organization",
        "repo" : "repository"
    }
    
The options set in *.gitban.json* will be overridden by anything specified explicitly on the command line.

Note:  For better security you may wish to not use basic authentication but instead use OAuth.  To do this
you must first create a an OAuth token with the following command line:

    curl -u '<your github login name>' -d '{"scopes":"repo","note":"gitban"}' https://api.github.com/authorizations
    
You will be prompted to login then you should see some JSON that looks like:

    {
      "token": "<your new OAuth token>",
      "note": "gitban",
      "note_url": null,
      "scopes": [
        "repo"
      ],
      "created_at": "2012-06-28T04:57:16Z",
      "app": {
        "url": "http://developer.github.com/v3/oauth/#oauth-authorizations-api",
        "name": "gitban (API)"
      },
      "url": "https://api.github.com/authorizations/437559",
      "id": 437559,
      "updated_at": "2012-06-28T04:57:16Z"
    }
    
Now just edit your *.gitban.json* file as follows:

    {
        "token" : "<your new token from above>",
        "user" : "username",
        "org" : "organization",
        "repo" : "repository"
    }
    
Done!  From this point forward you can manage (e.g. revoke) this token using the Applications tab from within
your github account settings.

###Workflow

The purpose of this tool is to provide a very simple workflow based loosely on the [kanban board](http://en.wikipedia.org/wiki/Kanban_board) style whereby all issues
are initially added to the system in a "backlog" / unassigned state.  Do this by just creating a new issue in github.

Next, issues can be assigned to team members.  This puts the issue into a "ready" state and can be done using the "take" command.

    gitban take 47
    
This will cause issue #47 to be assigned to you and set its state to ready.

When commencing to work on an issue use the "action" command.
(note that you action an issue without having to first take it)

    gitban action 47
    
This command does several things:

*  The issue will be assigned to you if it isn't already
*  The issue will be put into the "doing" state
*  Any other issue you may have been working on is moved from the doing to the ready state

As you can see from this logic the system will enforce only one issue be worked on at a time by each team member.

To close / complete issue just close the issue using github or the "fixes #" syntax in your commit comment.

Gitban uses the labels above to differentiate states of issues.
Gitban will add a small comment to the issue describing each state change for tracking.

##Examples

(note: these examples assume you have set up a .gitban.json so that github params do not have to always be specified)

List the issues currently assign to you

    gitban list
    
List issues currently assigned to bob

    gitban -a bob list
    
Take ownership of issue 47 and start working on it

    gitban action 47
    
Assign issue 47 to bob

    gitban -a bob take 47
    
Get information / comments on an issue

    gitban info 47
    
See a list of what each team member is currently working on

    gitban status
