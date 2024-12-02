import { type Client } from '@prisma/client'
import { withZod } from '@remix-validated-form/with-zod'
import { ValidatedForm } from 'remix-validated-form'
import { z } from 'zod'
import { FormInput } from '../forms/form-input'
import { Button } from '../ui/button'
import { SheetClose, SheetFooter } from '../ui/sheet'

export const clientValidator = withZod(
	z.object({
		name: z.string().min(1, 'Name is required'),
		email: z.string().nullish(),
		hourlyRate: z.string().nullish(),
		company: z.string().nullish(),
		line1: z.string().nullish(),
		line2: z.string().nullish(),
		city: z.string().nullish(),
		state: z.string().nullish(),
		zip: z.string().nullish(),
		phone: z.string().nullish(),
	}),
)

interface ClientFormProps {
	client?: Client
	onCancel?: () => void
	onSubmit?: () => void
	fetcher?: any
}

export function ClientForm({
	client,
	onCancel,
	onSubmit,
	fetcher,
}: ClientFormProps) {
	const isEditing = Boolean(client)
	const isSubmitting = fetcher?.state !== 'idle'

	return (
		<ValidatedForm
			method="post"
			validator={clientValidator}
			fetcher={fetcher}
			defaultValues={{
				name: client?.name ?? '',
				email: client?.email ?? '',
				hourlyRate: client?.hourlyRate?.toString() ?? '',
				company: client?.company ?? '',
				line1: client?.line1 ?? '',
				line2: client?.line2 ?? '',
				city: client?.city ?? '',
				state: client?.state ?? '',
				zip: client?.zip ?? '',
				phone: client?.phone ?? '',
			}}
			className="flex flex-1 flex-col"
		>
			<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
				<div className="flex gap-2">
					<FormInput name="name" label="Name" className="w-full" required />
					<FormInput
						name="email"
						label="Email"
						type="email"
						className="w-full"
					/>
				</div>
				<div className="flex gap-2">
					<FormInput name="phone" label="Phone" className="w-full" />
					<FormInput
						name="hourlyRate"
						label="Hourly Rate"
						type="number"
						min="0"
						step="0.01"
						className="w-full"
					/>
				</div>
				<FormInput name="line1" label="Address Line 1" />
				<FormInput name="line2" label="Address Line 2" />
				<div className="flex gap-2">
					<FormInput name="city" label="City" className="w-full" />
					<FormInput name="state" label="State" className="w-full" />
				</div>
				<FormInput name="zip" label="ZIP Code" />
			</div>
			<SheetFooter>
				{onCancel && (
					<SheetClose asChild>
						<Button variant="outline" type="button" onClick={onCancel}>
							Cancel
						</Button>
					</SheetClose>
				)}
				<Button
					type="submit"
					disabled={isSubmitting}
					onClick={e => {
						e.currentTarget.form?.submit()
						onSubmit?.()
					}}
				>
					{isSubmitting
						? isEditing
							? 'Saving...'
							: 'Creating...'
						: isEditing
							? 'Save Changes'
							: 'Create Client'}
				</Button>
			</SheetFooter>
		</ValidatedForm>
	)
}
