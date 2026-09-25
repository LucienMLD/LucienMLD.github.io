document.addEventListener("DOMContentLoaded", function(event) {
  const storageKey = 'theme-preference'

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
  }

  const theme = {
    value: getColorPreference(),
  }

  const inverseTheme = {
    dark: 'light',
    light: 'dark',
  }

  reflectPreference()

  const toggleButton = document.querySelector('#theme-toggle')
  if (toggleButton) {
    toggleButton.addEventListener('click', onClick)
  }

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', ({matches:isDark}) => {
      theme.value = isDark ? 'dark' : 'light'
      setPreference()
    })
});
