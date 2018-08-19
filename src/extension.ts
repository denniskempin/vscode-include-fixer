'use strict';
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

// clang-include-fixer output format (the bits that we use)
type HeaderInfo = {
    QualifiedName: string,
    Header: string
};
type CIFHeaders = {
    HeaderInfos: HeaderInfo[];
}

// Call clang-include-fixer on the provided document with `params` extra params.
// This will pass the provided document into stdin of clang-include-fixer to ensure
// it's got the current unsaved version.
function callCIF(params : string, document: vscode.TextDocument) : Promise<string> {
    return new Promise((resolve, reject) => {
        // todo: make path adjustable
        // todo: use array for parameters instead of escaping madness
        let cmdline = 'clang-include-fixer-6.0 -stdin ' + params + ' ' + path.basename(document.fileName);
        console.log(cmdline);
        let process = cp.exec(cmdline, {cwd: path.dirname(document.fileName)}, (err, stdout, stderr) => {
            if (stderr.length > 0) {
                reject(stderr);
                return;
            }
            resolve(stdout);
        });
        process.stdin.write(document.getText());
        process.stdin.end();
    });
}

// Call clang-include-fixer to query possible headers for the `query` symbol.
async function queryPossibleHeaders(query: string, document: vscode.TextDocument) : Promise<CIFHeaders> {
    const headers_str = await callCIF("-query-symbol='" + query + "'", document); 
    return JSON.parse(headers_str) as CIFHeaders;
}

// Pass in a CIFHeaders object with a single header that should be included in the document.
// Will return a string of the entire new document.
function insertHeader(headers: CIFHeaders, document: vscode.TextDocument) : Promise<string> {
    return callCIF('-insert-header=\'' + JSON.stringify(headers) + '\'', document); 
}

// Show quick pick view for user to select a header. Will remove all headers from the provided
// `headers` object to leave just the selected one.
async function askUserToSelectHeader(headers: CIFHeaders) : Promise<CIFHeaders | undefined> {
    const items: vscode.QuickPickItem[] = [];
    for (const info of headers.HeaderInfos) {
        items.push({
            label: info.QualifiedName,
            detail: info.Header
        });
    }
    const selected_item = await vscode.window.showQuickPick(items);
    if (!selected_item) { return undefined; }
    headers.HeaderInfos = headers.HeaderInfos.filter((info: any) => {
        return info.QualifiedName === selected_item.label;
    });
    return headers;
}

async function insertIncludeForSymbol(symbol: string, editor: vscode.TextEditor) {
    const headers = await queryPossibleHeaders(symbol, editor.document);
    const selected_header = await askUserToSelectHeader(headers);
    if (!selected_header) { return; }

    const updated_doc = await insertHeader(selected_header, editor.document);
    editor.edit((edit) => {
        // todo: Properly update document. Possibly update just the headers? 
        edit.replace(new vscode.Range(0, 0, editor.document.lineCount - 1, 0), updated_doc);
    });
}

function getSelectedSymbol(editor: vscode.TextEditor) : string | undefined {
    if (editor.selections.length < 1) { return; }
    let selection = editor.selections[0];
    if (selection.isEmpty) {
        // todo: Automatically select range of symbol under cursor.
        vscode.window.showInformationMessage("Select the symbol you would like to query.");
        return undefined;
    }
    return editor.document.getText(new vscode.Range(selection.start, selection.end));
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.clangIncludeFixer', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const selected_symbol = getSelectedSymbol(editor);
        if (!selected_symbol) { return; }
        insertIncludeForSymbol(selected_symbol, editor).catch((error) => {
            vscode.window.showErrorMessage("clang-include-fixer error: " + error);
        });
    });
    context.subscriptions.push(disposable);
}

export function deactivate() {
}