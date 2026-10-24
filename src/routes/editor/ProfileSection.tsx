import { useId, useState, type ChangeEvent } from 'react'
import { LIMITS } from '../../lib/types'
import { initials } from '../../profile/helpers'
import { Button, TextArea, TextField } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { readPhoto } from './photo'
import type { SectionProps } from './types'

export function ProfileSection({ draft, update }: SectionProps) {
  const fileId = useId()
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  const set = (field: 'name' | 'tagline' | 'bio' | 'location') => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value
    update((d) => ({ ...d, [field]: value }))
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError(null)
    setReading(true)
    try {
      const photo = await readPhoto(file)
      update((d) => ({ ...d, photo }))
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'That image could not be used. Try another file.')
    } finally {
      setReading(false)
    }
  }

  return (
    <section className="ed-section surface" aria-labelledby="ed-profile">
      <h2 id="ed-profile" className="ed-section__title">
        Profile
      </h2>

      <div className="ed-photo">
        {draft.photo ? (
          <img className="ed-photo__img" src={draft.photo} alt="Your profile photo" width={72} height={72} />
        ) : (
          <span className="ed-photo__img ed-photo__img--initials" aria-hidden="true">
            {initials(draft.name, 'You')}
          </span>
        )}
        <div className="ed-photo__body">
          <div className="ed-photo__actions">
            <input id={fileId} className="ed-photo__input" type="file" accept="image/*" onChange={(e) => void onFile(e)} aria-describedby={`${fileId}-msg`} />
            <label htmlFor={fileId} className="btn btn--secondary btn--sm ed-photo__pick" aria-busy={reading || undefined}>
              {reading ? <span className="spinner" aria-hidden="true" /> : <Icon name="upload" size={16} />}
              {draft.photo ? 'Replace photo' : 'Upload photo'}
            </label>
            {draft.photo && (
              <Button
                variant="quiet"
                size="sm"
                onClick={() => {
                  setPhotoError(null)
                  update((d) => ({ ...d, photo: null }))
                }}
              >
                Remove
              </Button>
            )}
          </div>
          <p id={`${fileId}-msg`} className={photoError ? 'ed-photo__msg ed-photo__msg--error' : 'ed-photo__msg'} role={photoError ? 'alert' : undefined}>
            {photoError ?? 'A square photo works best. It is resized to 512 px.'}
          </p>
        </div>
      </div>

      <div className="ed-fields">
        <TextField label="Name" name="name" autoComplete="off" value={draft.name} maxLength={LIMITS.name} counter onChange={set('name')} />
        <TextField label="Tagline" name="tagline" autoComplete="off" value={draft.tagline} maxLength={LIMITS.tagline} counter onChange={set('tagline')} hint="One line under your name." />
        <TextArea label="Bio" name="bio" value={draft.bio} maxLength={LIMITS.bio} counter rows={3} onChange={set('bio')} />
        <TextField label="Location" name="location" autoComplete="address-level2" value={draft.location} maxLength={LIMITS.location} counter onChange={set('location')} placeholder="City, region" />
      </div>
    </section>
  )
}
