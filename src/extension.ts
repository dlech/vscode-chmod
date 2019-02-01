'use strict';
import * as fs from 'fs';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    // common function for setting or clearing executable bits
    // @param res     a uri for the selected resource (context menu) or null
    // @param enable  set to true to to chmod +x or false to chmod -x
    let chmod = function(res: vscode.Uri, enable: boolean) {
        try {
            let fileName: string;
            if (!res) {
                if (vscode.window.activeTextEditor === undefined) {
                    vscode.window.showInformationMessage('No document selected.');
                    return;
                }
                fileName = vscode.window.activeTextEditor.document.fileName;
            } else {
                if (res.scheme !== "file") {
                    vscode.window.showInformationMessage('Selected item is not a file.');
                    return;
                }
                fileName = res.path;
            }
            let stat = fs.statSync(fileName);
            let mode = stat.mode & 0xFFFF;
            let x = fs.constants.S_IXUSR | fs.constants.S_IXGRP | fs.constants.S_IXOTH;
            if (enable) {
                mode |= x;
            } else {
                mode &= ~x;
            }
            fs.chmodSync(fileName, mode);
        } catch (error) {
            vscode.window.showErrorMessage(error);
        }
    };

    let chmodPlusX = vscode.commands.registerCommand('extension.chmodPlusX', (res) => {
        chmod(res, true);
    });
    context.subscriptions.push(chmodPlusX);

    let chmodMinusX = vscode.commands.registerCommand('extension.chmodMinusX', (res) => {
        chmod(res, false);
    });
    context.subscriptions.push(chmodMinusX);
}

export function deactivate() {
}
