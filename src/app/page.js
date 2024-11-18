import Image from 'next/image'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { redirect } from "next/navigation"
import { SignInButton } from '@/components/auth/SignInButton'

export const metadata = {
  title: 'VibeGPT',
  description: 'Chat with AI, Connect with Humans',
}

export default async function Home() {
  const session = await getServerSession(authOptions)
  
  if (session) {
    redirect("/welcome")
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0D0D0E] px-6">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-24 py-24 relative">
        {/* Gradient Line Separator */}
        <div className="hidden lg:block absolute top-1/2 left-1/2 -translate-y-1/2 w-px h-48 bg-gradient-to-b from-[#6366f1] via-[#6366f1]/50 to-transparent"></div>

        {/* Left Section - Logo and Title */}
        <div className="flex flex-col justify-center items-center lg:items-start space-y-10">
          <div className="relative w-36 h-36">
            <Image
              src="/logo.png"
              alt="VibeGPT Logo"
              fill
              className="object-contain drop-shadow-[0_0_25px_rgba(99,102,241,0.2)]"
              priority
            />
          </div>
          <div className="space-y-6 text-center lg:text-left">
            <h1 className="text-7xl font-bold text-white tracking-tight">
              VibeGPT
            </h1>
            <p className="text-3xl text-[#8E8EA0] font-medium">
              Chat with AI, Connect with Humans
            </p>
          </div>
        </div>

        {/* Right Section - Just the Button */}
        <div className="flex flex-col justify-center items-center">
          <SignInButton className="group relative overflow-hidden bg-gradient-to-r from-[#4F46E5] via-[#6366F1] to-[#818CF8] text-white font-semibold py-6 px-16 rounded-lg text-2xl transition-all duration-300 
          hover:shadow-[0_0_40px_rgba(99,102,241,0.4)] 
          hover:scale-[1.03] 
          shadow-[0_0_20px_rgba(99,102,241,0.2)]
          active:scale-[0.98]">
            <span className="relative z-10">Get Started</span>
            <div className="absolute inset-0 bg-gradient-to-r from-[#818CF8] via-[#6366F1] to-[#4F46E5] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
            <div className="absolute inset-0 bg-white/[0.02] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
          </SignInButton>
        </div>
      </div>
    </main>
  )
}
