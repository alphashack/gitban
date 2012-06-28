#!/usr/bin/env node
;(function ()
{ // wrapper in case we're in module_context mode

// windows: running "ssa blah" in this folder will invoke WSH, not node.
    if (typeof WScript !== "undefined")
    {
        WScript.echo("gitban does not work when run\n" + "with the Windows Scripting Host\n\n" + "'cd' to a different directory,\n" + "or type 'gitban.cmd <args>',\n" + "or type 'node gitban <args>'.");
        WScript.quit(1);
        return;
    }

    require('../lib');
})();

