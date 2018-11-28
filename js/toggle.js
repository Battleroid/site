(function() {
    // please don't judge me by how bad this is, I don't use javascript
    var color = document.getElementById('color');
    var syntax = document.getElementById('syntax');
    var toggle = document.getElementById('toggle');
    toggle.text = "darker";
    if (document.cookie.indexOf("bg=") != -1) {
        switch (document.cookie.split('bg=')[1]) {
            case 'light':
                color.setAttribute('href', '/css/light.css');
                syntax.setAttribute('href', '/css/github.css');
                toggle.text = "darker";
                break;
            case 'dark':
                color.setAttribute('href', '/css/dark.css');
                syntax.setAttribute('href', '/css/default.css');
                toggle.text = "lighter";
                break;
        }
    }
})();

function toggle() {
    var syntax = document.getElementById('syntax');
    var color = document.getElementById('color');
    var toggle = document.getElementById('toggle');
    var current = color.href.split('/').pop().split('.')[0];
    var desiredColor = current === 'light' ? 'dark' : 'light';
    var desiredSyntax = current === 'light' ? 'default' : 'github';
    var toggleText = current === 'light' ? 'lighter' : 'darker';
    console.log(`${current}, ${desiredColor}, ${desiredSyntax}, ${toggleText}`);
    color.href = `/css/${desiredColor}.css`;
    syntax.href = `/css/${desiredSyntax}.css`;
    document.cookie = `bg=${desiredColor};domain=.caseyweed.com;path=/`;
    toggle.text = toggleText;
}
