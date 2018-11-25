(function() {
    // please don't judge me by how bad this is, I don't use javascript
    var css = document.getElementById('main');
    var syntax = document.getElementById('syntax');
    var toggle = document.getElementById('toggle');
    toggle.text = "darker";
    if (document.cookie.indexOf("bg=") != -1) {
        switch (document.cookie.split('bg=')[1]) {
            case 'main':
                css.setAttribute('href', '/css/main.css');
                syntax.setAttribute('href', '/css/github.css');
                toggle.text = "darker";
                break;
            case 'dark':
                css.setAttribute('href', '/css/dark.css');
                syntax.setAttribute('href', '/css/default.css');
                toggle.text = "lighter";
                break;
        }
    }
})();

function toggle () {
    var css = document.getElementById('main');
    var syntax = document.getElementById('syntax');
    var toggle = document.getElementById('toggle');
    switch (css.href.split('/').pop()) {
        case 'main.css':
            css.setAttribute('href', '/css/dark.css');
            syntax.setAttribute('href', '/css/default.css');
            document.cookie = "bg=dark;domain=.caseyweed.com;path=/";
            toggle.text = "lighter";
            break;
        case 'dark.css':
            css.setAttribute('href', '/css/main.css');
            syntax.setAttribute('href', '/css/github.css');
            document.cookie = "bg=main;domain=.caseyweed.com;path=/";
            toggle.text = "darker";
            break;
    }
}
