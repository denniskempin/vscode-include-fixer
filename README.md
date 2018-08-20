# clang-include-fixer README

This extension is provides integration with the [clang-include-fixer][0] command line tool to query and add includes for missing C++ symbols. 

## Usage

This extension expects clang-include-fixer to be available and configured. With that in place, just invoke the 'clang-include-fixer' command from the command palette. It will let you choose which include file to insert. 

![Image of vscode-include-fixer in action](https://raw.githubusercontent.com/denniskempin/vscode-include-fixer/master/demo.png)

Please refer to the [clang documentation][0] for details on how to set up clang-include-fixer.

## Configuration

If 'clang-include-fixer' is not on your path, you can specify a full path or different binary in your user settings via: 

    "clang-include-fixer.binary": "/path/to/clang-include-fixer"

[0]: clang-include-fixer][https://clang.llvm.org/extra/include-fixer.html