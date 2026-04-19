import { createContext, useContext, useState } from 'react'

const BrandingContext = createContext({
  siteName: 'In Good Hands',
  logoUrl:  '/logos/hands-heart.svg',
  setBranding: () => {},
})

export function BrandingProvider({ children }) {
  const [siteName, setSiteName] = useState('In Good Hands')
  const [logoUrl,  setLogoUrl]  = useState('/logos/hands-heart.svg')

  const setBranding = ({ siteName: name, logoUrl: url }) => {
    if (name !== undefined) setSiteName(name)
    if (url  !== undefined) setLogoUrl(url)
  }

  return (
    <BrandingContext.Provider value={{ siteName, logoUrl, setBranding }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
