import {
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	json,
} from '@remix-run/node'
import { useFetcher, useLoaderData } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import { FormInput } from '#app/components/forms/form-input'
import { FormSelect } from '#app/components/forms/form-select.tsx'
import { Button } from '#app/components/ui/button'

import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
} from '#app/components/ui/sheet'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table'
import { getUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const userId = await getUserId(request)
	const [client, organizations] = await Promise.all([
		prisma.client.findUniqueOrThrow({
			where: { id: params.id },
			include: {
				timeEntries: {
					orderBy: { startTime: 'desc' },
				},
			},
		}),
		prisma.organization.findMany({
			where: { users: { some: { id: userId! } } },
		}),
	])

	return { client, organizations }
}

const validator = withZod(
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
		organizationId: z.string().nullish(),
	}),
)

export async function action({ request, params }: ActionFunctionArgs) {
	const formData = await request.formData()
	const { data, error } = await validator.validate(formData)
	if (error) return validationError(error)

	const { organizationId, ...rest } = data
	await prisma.client.update({
		where: { id: params.id },
		data: {
			...rest,
			...(organizationId && {
				organization: { connect: { id: organizationId } },
			}),
			hourlyRate: data.hourlyRate ? Number(data.hourlyRate) : null,
		},
	})
	return json({ updated: true })
}

export default function ClientDetailsRoute() {
	const { client, organizations } = useLoaderData<typeof loader>()
	const [isEditing, setIsEditing] = useState(false)
	const updateClient = useFetcher<{ updated: boolean }>()
	const isUpdatingClient = updateClient.state !== 'idle'

	useEffect(() => {
		if (updateClient.data?.updated) setIsEditing(false)
	}, [updateClient.data?.updated, updateClient.state])

	const totalDuration = client.timeEntries.reduce((acc, entry) => {
		const duration = entry.endTime
			? (new Date(entry.endTime).getTime() -
					new Date(entry.startTime).getTime()) /
				1000 /
				60 /
				60
			: 0
		return acc + duration
	}, 0)

	const totalAmount = totalDuration * Number(client.hourlyRate)

	const formatAmount = (amount: number) => {
		return amount.toLocaleString('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex items-center justify-between rounded-lg border p-4">
				<div>
					<div className="flex items-center gap-2">
						<p className="mb-2 text-2xl font-semibold text-gray-800">
							{client.name}
						</p>
						<Button
							onClick={() => setIsEditing(true)}
							size="icon"
							variant="ghost"
						>
							<Pencil size={16} />
						</Button>
					</div>
					<div className="mt-2 flex items-center gap-6">
						<p className="text-sm text-gray-600">
							Email: {client.email ?? 'N/A'}
						</p>
						<p className="text-sm text-gray-600">
							Hourly Rate: ${Number(client.hourlyRate).toFixed(2) ?? 'N/A'}
						</p>
					</div>
				</div>
			</div>

			<Sheet open={isEditing} onOpenChange={setIsEditing}>
				<SheetContent>
					<SheetHeader>Edit Client</SheetHeader>
					<ValidatedForm
						validator={validator}
						fetcher={updateClient}
						method="POST"
						defaultValues={{
							name: client.name,
							email: client.email ?? '',
							hourlyRate: client.hourlyRate?.toString() ?? '',
							company: client.company ?? '',
							line1: client.line1 ?? '',
							line2: client.line2 ?? '',
							city: client.city ?? '',
							state: client.state ?? '',
							zip: client.zip ?? '',
							phone: client.phone ?? '',
							organizationId: client.orgId,
						}}
						className="flex flex-1 flex-col overflow-hidden"
					>
						<div className="flex flex-1 flex-col gap-4 overflow-y-scroll p-4">
							<div className="flex gap-2">
								<FormInput name="name" label="Name" className="w-full" />
								<FormInput name="email" label="Email" className="w-full" />
							</div>
							<FormSelect
								name="organizationId"
								label="Organization"
								options={organizations.map(org => ({
									value: org.id,
									label: org.name,
								}))}
							/>
							<div className="flex gap-2">
								<FormInput name="phone" label="Phone" className="w-full" />
								<FormInput
									name="hourlyRate"
									label="Hourly Rate"
									type="number"
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
							<Button variant="outline" onClick={() => setIsEditing(false)}>
								Cancel
							</Button>
							<Button type="submit" isLoading={isUpdatingClient}>
								{isUpdatingClient ? 'Updating...' : 'Save Changes'}
							</Button>
						</SheetFooter>
					</ValidatedForm>
				</SheetContent>
			</Sheet>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Date</TableHead>
						<TableHead>Description</TableHead>
						<TableHead>Duration</TableHead>
						<TableHead>Amount</TableHead>
						<TableHead>Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{client.timeEntries.map(entry => {
						const duration = entry.endTime
							? (new Date(entry.endTime).getTime() -
									new Date(entry.startTime).getTime()) /
								1000 /
								60 /
								60
							: 0

						const amount = duration * Number(client.hourlyRate)

						return (
							<TableRow key={entry.id}>
								<TableCell>
									{new Date(entry.startTime).toLocaleDateString()}
								</TableCell>
								<TableCell>{entry.description}</TableCell>
								<TableCell>{duration.toFixed(2)} hrs</TableCell>
								<TableCell>${formatAmount(amount)}</TableCell>
								<TableCell>
									{entry.invoiceId
										? 'Billed'
										: entry.endTime
											? 'Completed'
											: 'In Progress'}
								</TableCell>
							</TableRow>
						)
					})}
					<TableRow className="font-medium">
						<TableCell>Total</TableCell>
						<TableCell />
						<TableCell>{totalDuration.toFixed(2)} hrs</TableCell>
						<TableCell>${formatAmount(totalAmount)}</TableCell>
						<TableCell />
					</TableRow>
				</TableBody>
			</Table>
		</div>
	)
}
