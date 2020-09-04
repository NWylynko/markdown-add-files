# markdown-add-files
github action to add in files as examples to markdown files 

this action finds markdown files and replaces `<!-- add-file: ./app.tsx -->` with the code from that file

## example 
this is a very simple action that add in the files and then pushes the built markdown to the repo

<!-- add-file: ./.github/workflows/md-builder.yml -->
