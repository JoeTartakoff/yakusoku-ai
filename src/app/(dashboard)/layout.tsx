'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

interface SidebarContextType {
  setSidebarChildren: (children: React.ReactNode) => void
  setMobileHeaderTitle: (title: string | undefined) => void
  setIsSidebarOpen: (open: boolean) => void
  isSidebarOpen: boolean
  user: any
}

const SidebarContext = createContext<SidebarContextType | null>(null)

export const useSidebar = () => {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within DashboardLayout')
  }
  return context
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [sidebarChildren, setSidebarChildren] = useState<React.ReactNode>(null)
  const [mobileHeaderTitle, setMobileHeaderTitle] = useState<string | undefined>(undefined)

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }
    
    setUser(user)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    )
  }

  return (
    <SidebarContext.Provider value={{ setSidebarChildren, setMobileHeaderTitle, setIsSidebarOpen, isSidebarOpen, user }}>
      <div className="h-screen bg-gray-50 flex overflow-hidden">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onOpen={() => setIsSidebarOpen(true)}
          user={user}
          activePath={pathname}
          onLogout={handleLogout}
          mobileHeaderTitle={mobileHeaderTitle}
        >
          {sidebarChildren}
        </Sidebar>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  )
}
