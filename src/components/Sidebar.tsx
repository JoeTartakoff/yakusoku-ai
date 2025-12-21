'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ReactNode } from 'react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  onOpen: () => void
  user: { email: string } | null
  activePath: string
  onLogout: () => void
  children?: ReactNode
  mobileHeaderTitle?: string
}

export default function Sidebar({
  isOpen,
  onClose,
  onOpen,
  user,
  activePath,
  onLogout,
  children,
  mobileHeaderTitle,
}: SidebarProps) {
  const isDashboardActive = activePath === '/dashboard'
  const isTeamsActive = activePath.startsWith('/teams')

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white shadow-lg flex flex-col h-screen
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <Image
            src="/logo.png"
            alt="YAKUSOKU AI"
            width={140}
            height={40}
            className="h-8 w-auto"
            priority
          />
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Navigation
              </h2>
            </div>
            <div className="space-y-1">
              <Link
                href="/dashboard"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                  isDashboardActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={onClose}
              >
                <span>📅</span>
                <span>スケジュール</span>
              </Link>
              <Link
                href="/teams"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                  isTeamsActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={onClose}
              >
                <span>👥</span>
                <span>チーム管理</span>
              </Link>
            </div>
          </div>

          {children}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-700 truncate">{user?.email}</span>
          </div>
          <button
            onClick={onLogout}
            className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            ログアウト
          </button>
        </div>
      </aside>

      <div className="lg:hidden bg-white shadow-sm sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onOpen}
            className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {mobileHeaderTitle ? (
            <h1 className="text-lg font-bold text-gray-900">{mobileHeaderTitle}</h1>
          ) : (
            <Image
              src="/logo.png"
              alt="YAKUSOKU AI"
              width={120}
              height={35}
              className="h-7 w-auto"
              priority
            />
          )}
          <div className="w-10"></div>
        </div>
      </div>
    </>
  )
}
