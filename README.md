gitban
======

very simple command line kanban-esque tool for use with github issues

##Installation

    npm install gitban
  
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

These can be put in a file called .gitban.json in your home directory for convenience. The format is:

    {
        "user" : "username",
        "pass" : "password",
        "org" : "organization",
        "repo" : "repository"
    }
    
The options set in .gitban.json will be overridden by anything specified explicitly on the command line.

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
