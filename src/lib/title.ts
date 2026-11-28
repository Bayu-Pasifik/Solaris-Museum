import { useEffect } from 'react'

const SITE = 'Solaris Museum'

/**
 * Names the tab after what the page shows. Without a name it is the name of the museum.
 * public/share.php gives the same names to link previews.
 */
export function useTitle(name?: string) {
  useEffect(() => {
    document.title = name ? `${name} · ${SITE}` : SITE
  }, [name])
}
