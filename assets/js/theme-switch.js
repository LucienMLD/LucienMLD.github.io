document.addEventListener("DOMContentLoaded", function(event) {
  const storageKey = 'theme-preference'
  let treeNationWidget = null;

  const onClick = () => {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    setPreference()
  }

  const getColorPreference = () => {
    if (localStorage.getItem(storageKey))
      return localStorage.getItem(storageKey)
    else
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  }

  const setPreference = () => {
    localStorage.setItem(storageKey, theme.value)
    reflectPreference()
  }

  const reflectPreference = () => {
    document.firstElementChild
      .setAttribute('data-theme', theme.value)

    const iconDark = document.getElementById('icon-dark')
    const iconLight = document.getElementById('icon-light')
    
    if (iconDark && iconLight) {
      if (theme.value === 'dark') {
        iconDark.style.display = 'none'
        iconLight.style.display = 'inline-block'
      } else {
        iconDark.style.display = 'inline-block'
        iconLight.style.display = 'none'
      }
    }

    document
      .querySelector('#theme-toggle')
      ?.setAttribute('aria-label', theme.value)

    if (typeof TreeNationOffsetWebsite !== 'undefined') {
      const container = document.querySelector('#tree-nation-offset-website');
      if (container) {
        container.innerHTML = '';

        treeNationWidget = TreeNationOffsetWebsite({
          code: '65d8c4d86b654',
          lang: 'fr',
          theme: theme.value
        });
        treeNationWidget.render('#tree-nation-offset-website');
      }
    }
  }

  const theme = {
    value: getColorPreference(),
  }

  const inverseTheme = {
    dark: 'light',
    light: 'dark',
  }

  function initTreeNation() {
    if (typeof TreeNationOffsetWebsite !== 'undefined' && !treeNationWidget) {
      treeNationWidget = TreeNationOffsetWebsite({
        code: '65d8c4d86b654',
        lang: 'fr',
        theme: theme.value
      });
      treeNationWidget.render('#tree-nation-offset-website');
    } else if (!treeNationWidget) {
      setTimeout(initTreeNation, 100);
    }
  }

  reflectPreference()

  const toggleButton = document.querySelector('#theme-toggle')
  if (toggleButton) {
    toggleButton.addEventListener('click', onClick)
  }
  initTreeNation()

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', ({matches:isDark}) => {
      theme.value = isDark ? 'dark' : 'light'
      setPreference()
    })
});
