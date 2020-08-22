import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import * as util from "util";
import * as glob from "glob";
import * as fetch from "node-fetch";

// convert callback functions to async friendly functions
const readFile = util.promisify(fs.readFile);
const globAsync = util.promisify(glob);

// get the name of the repo this action is running in
const fullRepo = github.context.payload.repository.full_name;

const repo = fullRepo.split("/")[1];

// only want to run the code in the repo this is being run on
const repoDir = `/home/runner/work/${repo}/${repo}`;

// get the buzzword if it has been defined by the action running this
const buzzword = core.getInput("buzzword") || "+++";

async function run() {
  const folders = `${repoDir}/**/*.md.template`;

  //get the files that end in .md.template
  const files = await globAsync(folders);

  // loop over each file found
  files.forEach(async (path) => {
    // get the path of the readme file so the files called from it are local
    let pathWithoutFileArray = path.split("/");
    pathWithoutFileArray.pop();
    const pathWithoutFile = pathWithoutFileArray.join("/") + "/";

    // read in the markdown template file
    const markdownFile = await readFile(path, "utf8");

    // split the file by the buzzword to 'find' it
    const parts = markdownFile.split("\n" + buzzword);

    // using promise.all and map to force node to wait for the code in the loop to happen
    const replacements = await Promise.all(
      parts.map(async (part) => {

        // just want the first line
        const line = part.split("\n")[0];

        // we only want ones that start with file:
        // this will generally be because when u split a string it still has the first part
        // eg 'banana : apple * pizza : burger * pizza : chips'.split(' * ') =>
        //  |- dont want -|      -- want --        -- want --
        // ['banana : apple', 'pizza : burger', 'pizza : chips']
        // so check if it starts with "file:"
        if (part.substring(0, 5) === "file:") {
          // cut off the "file: " part
          const fileDir = line.substring(6);

          try {
            // read in the file
            const file = await readFile(pathWithoutFile + fileDir, "utf8");

            // this just gets the extension of the file by taking whatever is after the last .
            const fileExtension = fileDir.split(".").pop(); 

            // add the file in-between ```
            const markdown = "\n``` " + fileExtension + "\n" + file + "\n```\n";

            // return stuff so the later code can use it to replace the markdown
            return {
              markdown,
              fileDir,
              replace: `${buzzword}file: ${fileDir}`,
            };
          } catch (error) {
            throw new Error(`cant open or find ${fileDir} error: ${error}`);
          }
        } else if (part.substring(0, 4) === "web:") {
          // cut off the "web: " part
          const fileURL = line.substring(5);

          try {
            // read in the file
            const file = await fetch(fileURL);

            // this just gets the extension of the file by taking whatever is after the last .
            // needs to be changed to support more urls
            const fileExtension = fileURL.split(".").pop();

            // add the file in-between ```
            const markdown = "\n``` " + fileExtension + "\n" + file + "\n```\n";

            // return stuff so the later code can use it to replace the markdown
            return {
              markdown,
              fileDir: fileURL,
              replace: `${buzzword}file: ${fileURL}`,
            };
          } catch (error) {
            throw new Error(`cant fetch ${fileURL} error: ${error}`);
          }
        } else {
          return {};
        }
      })
    );

    console.log(`opened ${path}`);

    // take out the .template part so its just .md
    const newFilePath = path.replace(".template", "");

    let newMarkdownFile = markdownFile;
    for (const x of replacements) {
      // sometimes things just dont want to be replaced
      if (x.replace) {
        // take out the 'file: ./example/app.tsx' and replace it with the markdown
        newMarkdownFile = newMarkdownFile.replace(x.replace, x.markdown);
        console.log(`  ✔ injected ${x.fileDir}`);
      }
    }

    // write the new markdown file
    fs.writeFileSync(newFilePath, newMarkdownFile);
    console.log(`✔ done ${newFilePath}`);
  });
}

run();
