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
function callCIF(args: string[], document: vscode.TextDocument): Promise<string> {
    const config = vscode.workspace.getConfiguration('clang-include-fixer', document.uri);
    const binary = config.get("binary") as string;
    return new Promise((resolve, reject) => {
        const full_args = args.concat(["-stdin", path.basename(document.fileName)]);
        const params = { cwd: path.dirname(document.fileName) };
        let process = cp.execFile(binary, full_args, params, (err, stdout, stderr) => {
            if (err) {
                // todo: Add 'not found' error message for windows as well.
                const code = (err as any).code;
                if (code === "ENOENT") {
                    err.message = "binary not found: " + binary;
                }
                if (stderr) {
                    err.message += "\nSTDERR: " + stderr;
                }
                reject(err);
                return;
            }
            resolve(stdout);
        });
        process.stdin.write(document.getText());
        process.stdin.end();
    });
}

// Call clang-include-fixer to query possible headers for the `query` symbol.
async function queryPossibleHeaders(query: string, document: vscode.TextDocument): Promise<CIFHeaders> {
    const headers_str = await callCIF(["-query-symbol", query], document);
    return JSON.parse(headers_str) as CIFHeaders;
}

// Pass in a CIFHeaders object with a single header that should be included in the document.
// Will return a string of the entire new document.
function insertHeader(headers: CIFHeaders, document: vscode.TextDocument): Promise<string> {
    return callCIF(['-insert-header', JSON.stringify(headers)], document);
}

// Show quick pick view for user to select a header. Will remove all headers from the provided
// `headers` object to leave just the selected one.
async function askUserToSelectHeader(headers: CIFHeaders): Promise<CIFHeaders | undefined> {
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
        return info.Header === selected_item.detail;
    });
    return headers;
}

async function insertIncludeForSymbol(symbol: string, editor: vscode.TextEditor) {
    const headers = await queryPossibleHeaders(symbol, editor.document);
    const selected_header = await askUserToSelectHeader(headers);
    if (!selected_header) { return; }
    const position_before = editor.selection.active;
    const line_count_before = editor.document.lineCount;

    // Update document with content from clang-include-fixer
    const updated_doc = await insertHeader(selected_header, editor.document);
    await editor.edit((edit) => {
        const whole_doc_range = editor.document.validateRange(
            new vscode.Range(0, 0, line_count_before, 0));
        edit.replace(whole_doc_range, updated_doc);
    });
    
    // Remove selection and move cursor down to previous approximate location.
    const line_count_change = editor.document.lineCount - line_count_before;
    const position_after = position_before.with(
        {line: position_before.line + line_count_change});
    editor.selections = [new vscode.Selection(position_after, position_after)];
}

function getSelectedSymbol(editor: vscode.TextEditor): string | undefined {
    if (editor.selections.length > 1) {
        vscode.window.showErrorMessage("Does not support multiple cursors.");
        return undefined;
    }
    if (editor.selection.isEmpty) {
        const range = editor.document.getWordRangeAtPosition(editor.selection.active);
        if (range) {
            return editor.document.getText(range);
        }
        return undefined;
    } else {
        const range = new vscode.Range(editor.selection.start, editor.selection.end);
        return editor.document.getText(range);
    }
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.clangIncludeFixer', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const selected_symbol = getSelectedSymbol(editor);
        if (!selected_symbol) { return; }
        insertIncludeForSymbol(selected_symbol, editor).catch((error) => {
            vscode.window.showErrorMessage("clang-include-fixer error: " + error.message);
        });
    });
    context.subscriptions.push(disposable);
}

export function deactivate() {
}
