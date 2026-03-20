const fs = require('fs');
let code = fs.readFileSync('get_groups.js', 'utf8');
code = code.replace(/\\/\\/groups\\/\\/\\(\\d\\+\\)\\\/\\?\\//g, "/\\/groups\\/(\\d+)\\/?/");
code = code.replace(/href\\.match\\(\\/\\/\\/groups\\/\\/\\(\\[\\^\\\\/\\\\\\?\\]\\+\\)\\/\\)/g, "href.match(/\\/groups\\/([^\\/\\?]+)/)");
code = code.replace(/text\\.match\\(\\/\\(\\\\d\\+\\[\\.,\\]\\?\\\\d\\*\\[KM\\]\\?\\)\\\\s\\*\\(thÃ nh viÃªn\\|members\\)\\/i\\)/g, "text.match(/(\\d+[.,]?\\d*[KM]?)\\s*(thành viên|members)/i)");
code = code.replace(/\\/\\/groups\\/\\//g, '\\/groups\\/');

// Hard replace to be absolutely sure
code = code.replace("const idMatch = href.match(/\\/\\/groups\\/\\/(\\d+)\\/?/) || href.match(/\\/\\/groups\\/\\/([^\\/\\?]+)/);", "const idMatch = href.match(/\\/groups\\/(\\d+)\\/?/) || href.match(/\\/groups\\/([^\\/\\?]+)/);");

code = code.replace("const mMatch = text.match(/(\\d+[.,]?\\d*[KM]?)\\s*(thÃ nh viÃªn|members)/i);", "const mMatch = text.match(/(\\d+[.,]?\\d*[KM]?)\\s*(thành viên|members)/i);");

fs.writeFileSync('get_groups.js', code, 'utf8');
console.log("Fixed!");
