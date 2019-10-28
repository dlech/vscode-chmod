import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const chmodPlusX = vscode.commands.registerCommand('chmod.plusX', (res: any) => {
        chmod(res && res.resourceUri || res, true).catch(reason => vscode.window.showErrorMessage(reason.message));
    });
    context.subscriptions.push(chmodPlusX);

    const chmodMinusX = vscode.commands.registerCommand('chmod.minusX', (res: any) => {
        chmod(res && res.resourceUri || res, false).catch(reason => vscode.window.showErrorMessage(reason.message));
    });
    context.subscriptions.push(chmodMinusX);
}

export function deactivate() {
}

// promisify some stuff so we can async/await
const fsStat = util.promisify(fs.stat);
const fsChmod = util.promisify(fs.chmod);
const execFile = util.promisify(childProcess.execFile);

/** common function for setting or clearing executable bits
 * @param res     a uri for the selected resource (context menu) or null
 * @param enable  set to true to to chmod +x or false to chmod -x
 */
async function chmod(res: vscode.Uri, enable: boolean): Promise<void> {
    let fileName: string;
    if (!res) {
        if (vscode.window.activeTextEditor === undefined) {
            throw new Error('No document selected.');
        }
        fileName = vscode.window.activeTextEditor.document.fileName;
    } else {
        if (res.scheme !== "file") {
            throw new Error('Selected item is not a file.');
        }
        fileName = res.fsPath;
    }

    // Windows doesn't know about POSIX file permissions, so use git instead
    if (os.platform() === 'win32') {
        const git = new Git();
        // mode will be NaN if file is not in the git index
        const mode = await git.getMode(fileName);
        // so we have to add it to the git index if we want to set the executable bit
        const add = enable && isNaN(mode);
        await git.setMode(fileName, enable, add);
        return;
    }

    const stat = await fsStat(fileName);
    let mode = stat.mode & 0xFFFF;
    const x = fs.constants.S_IXUSR | fs.constants.S_IXGRP | fs.constants.S_IXOTH;
    if (enable) {
        mode |= x;
    } else {
        mode &= ~x;
    }
    await fsChmod(fileName, mode);
}

class Git {
    private path: string;

    public constructor() {
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (gitExtension === undefined) {
            throw new Error("Git extension is not installed.");
        }
        const api = gitExtension.exports.getAPI(1);
        this.path = api.git.path;
    }

    private async exec(cwd: string, args: string[]): Promise<string> {
        const result =  await execFile(this.path, args, {
            cwd: cwd,
            windowsHide: true,
        });
        return result.stdout;
    }

    /**
     * Gets the mode of a file according to `git ls-files`.
     * @param filename The absolute path to the file.
     * @returns The file mode or NaN if the file is not in the git index.
     */
    public async getMode(filename: string): Promise<number> {
        const directory = path.dirname(filename);
        const stat = await this.exec(directory, ['ls-files', '--stage', filename]);
        const mode = stat.split(/ /g)[0];
        return parseInt(mode, 8);
    }

    /**
     * Sets or clears the exectuable mode bits using `git update-index`.
     * @param filename The absolute path to the file.
     * @param executable When true, the executable bit will be set, otherwise it will be cleared.
     * @param add When true, the file will be added to the git index.
     */
    public async setMode(filename: string, executable: boolean, add: boolean): Promise<void> {
        const directory = path.dirname(filename);
        const plusMinus = executable ? '+' : '-';
        const args = ['update-index', `--chmod=${plusMinus}x`, filename];
        if (add) {
            args.splice(2, 0, '--add');
        }
        await this.exec(directory, args);
    }
}
