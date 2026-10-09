import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from './i18n'
import { Layout } from './components/Chrome'
import Landing from './pages/Landing'
import EventPage from './pages/EventPage'
import Admin from './pages/Admin'
import { MyPage, MyTable, NextSeat, Privacy, Verify } from './pages/MyPages'

function ScrollToHash() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView(), 50)
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <ScrollToHash />
        <Routes>
          <Route path="/admin/*" element={<Admin />} />
          <Route path="*" element={
            <Layout>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/events/:slug" element={<EventPage />} />
                <Route path="/my/:token" element={<MyPage />} />
                <Route path="/my/:token/table" element={<MyTable />} />
                <Route path="/my/:token/next" element={<NextSeat />} />
                <Route path="/verify/:token" element={<Verify />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="*" element={<div className="narrow"><h1>404</h1></div>} />
              </Routes>
            </Layout>
          } />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  )
}
