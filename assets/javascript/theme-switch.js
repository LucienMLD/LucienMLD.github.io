document.addEventListener("DOMContentLoaded", function(event) {

  const storageKey = 'theme-preference'

  const onClick = () => {
    // flip current value
    theme.value = theme.value === 'light'
      ? 'dark'
      : 'light'

    setPreference()
  }

  const getColorPreference = () => {
    if (localStorage.getItem(storageKey))
      return localStorage.getItem(storageKey)
    else
      return window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
  }

  const setPreference = () => {
    localStorage.setItem(storageKey, theme.value)
    reflectPreference()
  }

  const reflectPreference = () => {
    document.firstElementChild
      .setAttribute('data-theme', theme.value)

    document.getElementById('icon-' + theme.value).style.display = 'none'
    document.getElementById('icon-' + inverseTheme[theme.value]).style.display = 'inline-block'

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

  window.onload = () => {
    reflectPreference()

    document.querySelector('#theme-toggle').addEventListener('click', onClick)
  }

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', ({matches:isDark}) => {
      theme.value = isDark ? 'dark' : 'light'
      setPreference()
    })
});
