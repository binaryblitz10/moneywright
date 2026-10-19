/**
 * Profiles section component
 */

import { useState } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ProfileCard } from './profile-card'
import { ProfileModal } from './profile-modal'
import type { Profile } from './types'

interface ProfilesSectionProps {
  profiles: Profile[]
}

export function ProfilesSection({ profiles }: ProfilesSectionProps) {
  const [showModal, setShowModal] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)

  const handleCreate = () => {
    setEditingProfile(null)
    setShowModal(true)
  }

  const handleEdit = (profile: Profile) => {
    setEditingProfile(profile)
    setShowModal(true)
  }

  const handleCloseModal = (open: boolean) => {
    if (!open) {
      setShowModal(false)
      setEditingProfile(null)
    }
  }

  return (
    <>
      <SectionCard
        title="Profiles"
        action={
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCreate}>
            <Plus className="mr-1 h-3 w-3" />
            Add Profile
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} onEdit={handleEdit} canDelete />
          ))}
        </div>
      </SectionCard>

      <ProfileModal
        open={showModal}
        onOpenChange={handleCloseModal}
        editingProfile={editingProfile}
      />
    </>
  )
}
