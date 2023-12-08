"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exit = exports.retrieveCols = exports.NewAction = void 0;
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
const chalk = require("chalk");
const child_process_1 = require("child_process");
const inquirer = require("inquirer");
const fs = require("fs");
const questions_1 = require("../questions/questions");
const defaults_1 = require("../configuration/defaults");
const collections_1 = require("../collections");
const ui_1 = require("../ui");
const abstract_action_1 = require("./abstract.action");
const formatting_1 = require("../utils/formatting");
const path_1 = require("path");
const git_runner_1 = require("../runners/git.runner");
const package_managers_1 = require("../package-managers/");
class NewAction extends abstract_action_1.AbstractAction {
    async handle(inputs, options) {
        const directoryOption = options.find((option) => option.name === 'directory');
        const dryRunOption = options.find((option) => option.name === 'dry-run');
        const isDryRunEnabled = dryRunOption && dryRunOption.value;
        await askForMissingInformation(inputs, options);
        await generateApplicationFiles(inputs, options).catch(exports.exit);
        const shouldSkipInstall = options.some((option) => option.name === 'skip-install' && option.value === true);
        const shouldSkipGit = options.some((option) => option.name === 'skip-git' && option.value === true);
        const projectDirectory = getProjectDirectory(getApplicationNameInput(inputs), directoryOption);
        await Promise.all([
            renameDotEnvDotExample(projectDirectory),
            createEmptyDistDirectory(projectDirectory),
        ]);
        if (!shouldSkipInstall) {
            await installPackages(options, isDryRunEnabled, projectDirectory);
        }
        if (!isDryRunEnabled) {
            if (!shouldSkipGit) {
                await initializeGitRepository(projectDirectory);
                // await createGitIgnoreFile(projectDirectory);
            }
        }
        process.exit(0);
    }
}
exports.NewAction = NewAction;
const getApplicationNameInput = (inputs) => inputs.find((input) => input.name === 'name');
const getPackageManagerInput = (inputs) => inputs.find((options) => options.name === 'packageManager');
const getProjectDirectory = (applicationName, directoryOption) => {
    return ((directoryOption && directoryOption.value) ||
        (0, formatting_1.normalizeToKebabOrSnakeCase)(applicationName.value));
};
const askForMissingInformation = async (inputs, options) => {
    console.info(ui_1.MESSAGES.PROJECT_INFORMATION_START);
    console.info();
    const prompt = inquirer.createPromptModule();
    const nameInput = getApplicationNameInput(inputs);
    if (!nameInput.value) {
        const message = 'What name would you like to use for the new project?';
        const questions = [(0, questions_1.generateInput)('name', message)('pret-app')];
        const answers = await prompt(questions);
        replaceInputMissingInformation(inputs, answers);
    }
    const packageManagerInput = getPackageManagerInput(options);
    if (!packageManagerInput.value) {
        const answers = await askForPackageManager();
        replaceInputMissingInformation(options, answers);
    }
};
const replaceInputMissingInformation = (inputs, answers) => {
    return inputs.map((input) => (input.value =
        input.value !== undefined ? input.value : answers[input.name]));
};
const generateApplicationFiles = async (args, options) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionName = options.find((option) => option.name === 'collection' && option.value != null).value;
    console.log('collectionName: ', collectionName);
    const collection = collections_1.CollectionFactory.create(collectionName || collections_1.Collection.NESTPRET);
    console.log('collection: ', collection);
    const schematicOptions = mapSchematicOptions(args.concat(options));
    await collection.execute('application', schematicOptions);
    console.info();
};
const mapSchematicOptions = (options) => {
    return options.reduce((schematicOptions, option) => {
        if (option.name !== 'skip-install') {
            schematicOptions.push(new collections_1.SchematicOption(option.name, option.value));
        }
        return schematicOptions;
    }, []);
};
const installPackages = async (options, dryRunMode, installDirectory) => {
    const inputPackageManager = getPackageManagerInput(options).value;
    let packageManager;
    if (dryRunMode) {
        console.info();
        console.info(chalk.green(ui_1.MESSAGES.DRY_RUN_MODE));
        console.info();
        return;
    }
    try {
        packageManager = package_managers_1.PackageManagerFactory.create(inputPackageManager);
        await packageManager.install(installDirectory, inputPackageManager);
    }
    catch (error) {
        if (error && error.message) {
            console.error(chalk.red(error.message));
        }
    }
};
const askForPackageManager = async () => {
    const questions = [
        (0, questions_1.generateSelect)('packageManager')(ui_1.MESSAGES.PACKAGE_MANAGER_QUESTION)([
            package_managers_1.PackageManager.NPM,
            package_managers_1.PackageManager.YARN,
            package_managers_1.PackageManager.PNPM,
        ]),
    ];
    const prompt = inquirer.createPromptModule();
    return await prompt(questions);
};
const initializeGitRepository = async (dir) => {
    const runner = new git_runner_1.GitRunner();
    await runner.run('init', true, (0, path_1.join)(process.cwd(), dir)).catch(() => {
        console.error(chalk.red(ui_1.MESSAGES.GIT_INITIALIZATION_ERROR));
    });
};
/**
 * Write a file `.gitignore` in the root of the newly created project.
 * `.gitignore` available in `@nestjs/schematics` cannot be published to
 * NPM (needs to be investigated).
 *
 * @param dir Relative path to the project.
 * @param content (optional) Content written in the `.gitignore`.
 *
 * @return Resolves when succeeds, or rejects with any error from `fn.writeFile`.
 */
const createGitIgnoreFile = (dir, content) => {
    const fileContent = content || defaults_1.defaultGitIgnore;
    const filePath = (0, path_1.join)(process.cwd(), dir, '.gitignore');
    if (fileExists(filePath)) {
        return;
    }
    return fs.promises.writeFile(filePath, fileContent);
};
/**
 * Renames the `.env.example` file from the root of the newly created project to just `.env`.
 * Also generates a random value to use as the JWT secret so each generated project has a
 * unique encryption key.
 *
 * @param dir Relative path to the project.
 *
 * @return Resolves when succeeds, or rejects with any error from `fn.rename`.
 */
const renameDotEnvDotExample = (dir) => {
    const filePath = (0, path_1.join)(process.cwd(), dir, '.env.example');
    const newPath = (0, path_1.join)(process.cwd(), dir, '.env');
    if (!fileExists(filePath)) {
        return;
    }
    // JWT_SECRET=YOUR_SECURE_SECRET
    return fs.promises.rename(filePath, newPath);
};
/**
 * Creates an empty 'dist' directory at the root of the project. The dist folder is not checked into
 * git or published to npm, but is expected by docker.
 *
 * @param dir Relative path to the project.
 *
 * @return Resolves when succeeds, or rejects with any error from `fn.mkdir`.
 */
const createEmptyDistDirectory = (dir) => {
    const distPath = (0, path_1.join)(process.cwd(), dir, '/dist');
    return fs.promises.mkdir(distPath);
};
// const printCollective = () => {
//   const dim = print('dim');
//   const yellow = print('yellow');
//   const emptyLine = print();
//   emptyLine();
//   yellow(`Thanks for installing Nest ${EMOJIS.PRAY}`);
//   dim('Please consider donating to our open collective');
//   dim('to help us maintain this package.');
//   emptyLine();
//   emptyLine();
//   print()(
//     `${chalk.bold(`${EMOJIS.WINE}  Donate:`)} ${chalk.underline(
//       'https://opencollective.com/nest',
//     )}`,
//   );
//   emptyLine();
// };
const print = (color = null) => (str = '') => {
    const terminalCols = (0, exports.retrieveCols)();
    const strLength = str.replace(/\u001b\[[0-9]{2}m/g, '').length;
    const leftPaddingLength = Math.floor((terminalCols - strLength) / 2);
    const leftPadding = ' '.repeat(Math.max(leftPaddingLength, 0));
    if (color) {
        str = chalk[color](str);
    }
    console.log(leftPadding, str);
};
const retrieveCols = () => {
    const defaultCols = 80;
    try {
        const terminalCols = (0, child_process_1.execSync)('tput cols', {
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        return parseInt(terminalCols.toString(), 10) || defaultCols;
    }
    catch {
        return defaultCols;
    }
};
exports.retrieveCols = retrieveCols;
const fileExists = (path) => {
    try {
        fs.accessSync(path);
        return true;
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return false;
        }
        throw err;
    }
};
const exit = () => process.exit(1);
exports.exit = exit;
