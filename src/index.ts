import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import * as util from "util";
import * as glob from "glob";
import fetch from "node-fetch";

// convert callback functions to async friendly functions
const readFile = util.promisify(fs.readFile);
const globAsync = util.promisify(glob);

// get the name of the repo this action is running in
const fullRepo = github.context.payload.repository.full_name;

const repo = fullRepo.split("/")[1];

// only want to run the code in the repo this is being run on
const repoDir = `/home/runner/work/${repo}/${repo}`;

// const repoDir = __dirname + '/../examples'

async function run() {
  const folders = `${repoDir}/**/*.md`;

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
    const parts = markdownFile.split("<!-- add-");

    console.log(parts)

    // using promise.all and map to force node to wait for the code in the loop to happen
    const replacements = await Promise.all(
      parts.map(async (part) => {

        // just want the first line
        const line = part.split("-->")[0].trim()

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
              replace: `<!-- add-file: ${fileDir} -->`,
            };
          } catch (error) {
            throw new Error(`cant open or find ${fileDir} error: ${error}`);
          }
        } else if (part.substring(0, 4) === "web:") {
          // cut off the "web: " part
          const fileURL = line.substring(5);

          try {
            // read in the file
            const response = await fetch(fileURL);

            const file = await response.text()

            // this just gets the extension of the file by taking whatever is after the last .
            // needs to be changed to support more urls
            const fileExtension = fileURL.split(".").pop();

            // add the file in-between ```
            const markdown = "\n``` " + fileExtension + "\n" + file + "\n```\n";

            // return stuff so the later code can use it to replace the markdown
            return {
              markdown,
              fileDir: fileURL,
              replace: `<!-- add-web: ${fileURL} -->`,
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

    let newMarkdownFile = markdownFile;
    for (const x of replacements) {
      // sometimes things just don't want to be replaced
      if (x.replace) {
        // append the markdown to the <!-- --> so it shows up underneath
        newMarkdownFile = newMarkdownFile.replace(x.replace, x.replace + x.markdown);
        console.log(`  ✔ injected ${x.fileDir}`);
      }
    }

    // write the new markdown file
    fs.writeFileSync(path, newMarkdownFile);
    console.log(`✔ done ${path}`);
  });
}

run();
