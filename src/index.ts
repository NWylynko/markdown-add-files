import * as core from "@actions/core";
import * as fs from "fs";
import * as util from "util";
import * as glob from "glob";

// convert callback functions to async friendly functions
const readFile = util.promisify(fs.readFile);
const globAsync = util.promisify(glob);

// get the buzzword if it has been defined by the action running this
const buzzword = core.getInput("buzzword") || "+++";

async function run() {
  // glob uses full path so __dirname is needed
  const folders = __dirname + "/../../**/*.md.template";

  console.log(folders)

  //get the files that end in .md.template
  const files = await globAsync(folders);

  console.log(files)

  // loop over each file found
  files.forEach(async (path) => {
    // read in the markdown template file
    const markdownFile = await readFile(path, "utf8");

    // split the file by the buzzword to 'find' it
    const parts = markdownFile.split('\n' + buzzword);

    // using promise.all and map to force node to wait for the code in the loop to happen
    const replacements = await Promise.all(
      parts.map(async (part) => {
        // we only want ones that start with file:
        // this will generally be because when u split a string it still has the first part
        // eg 'banana : apple * pizza : burger * pizza : chips'.split(' * ') =>
        //  |- dont want -|      -- want --        -- want --
        // ['banana : apple', 'pizza : burger', 'pizza : chips']
        // so check if it starts with "file:"
        if (part.substring(0, 5) === "file:") {
          // just want the first line
          const line = part.split("\n")[0];

          // cut off the "file: " part
          const fileDir = line.substring(6);

          try {
            // read in the file
            const file = await readFile(fileDir, "utf8");

            // this just gets the extension of the file by taking whatever is after the last .
            const fileExtension = fileDir.split(".")[
              fileDir.split(".").length - 1
            ];

            // add the file inbetween ```
            const markdown = "\n```" + fileExtension + "\n" + file + "\n```\n";

            // return stuff so the later code can use it to replace the markdown
            return {
              markdown,
              fileDir,
              replace: `${buzzword}file: ${fileDir}`,
            };
          } catch (error) {
            throw new Error(`cant open or find ${fileDir}`);
          }
        } else {
          return {};
        }
      })
    );

    // just get the local path to the markdown file
    const shortPath = path.substring(__dirname.length - 4);

    console.log(`opened ./${shortPath}`);

    // take out the .template part so its just .md
    const newFilePath = shortPath.replace(".template", "");

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
    console.log(`✔ done ./${newFilePath}`);
  });
}

run();
