import { type TimeEntry } from '@prisma/client'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Link, useLoaderData, useFetcher } from '@remix-run/react'
import { subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TimeEntriesTable } from '#app/components/time-entries-table.tsx'
import { Button } from '#app/components/ui/button'
import { Input } from '#app/components/ui/input'
import { getOrgId } from '#app/routes/api+/preferences+/organization/cookie.server.ts'
import { prisma } from '#app/utils/db.server'
import { Timer } from './timer'

export async function loader({ request }: LoaderFunctionArgs) {
	const orgId = getOrgId(request)
	const url = new URL(request.url)
	const skip = parseInt(url.searchParams.get('skip') || '0', 10)
	const take = parseInt(url.searchParams.get('take') || '10', 10)
	const selectedClients = url.searchParams.get('clients')?.split(',') || []
	const startDate = url.searchParams.get('startDate')
	const endDate = url.searchParams.get('endDate')

	const dateFilter = {
		...(startDate && { gte: new Date(startDate) }),
		...(endDate && { lte: new Date(endDate) }),
	}

	const currentMonth = new Date()
	const lastMonth = subMonths(currentMonth, 1)

	const [
		clients,
		activeTimeEntry,
		timeEntries,
		timeEntriesCount,
		burndownEntries,
	] = await Promise.all([
		prisma.client.findMany({
			select: {
				id: true,
				name: true,
				company: true,
				hourlyRate: true,
				timeEntries: {
					select: {
						startTime: true,
						endTime: true,
					},
				},
			},
			where: { organization: { id: orgId! }, deletedAt: null },
		}),
		prisma.timeEntry.findFirst({
			where: {
				endTime: null,
				client: { organization: { id: orgId! }, deletedAt: null },
			},
		}),
		prisma.timeEntry.findMany({
			orderBy: { startTime: 'desc' },
			include: { client: true, invoice: true },
			where: {
				client: {
					organization: { id: orgId! },
					deletedAt: null,
					...(selectedClients.length ? { id: { in: selectedClients } } : {}),
				},
				...(Object.keys(dateFilter).length ? { startTime: dateFilter } : {}),
			},
		}),
		prisma.timeEntry.count({
			where: {
				client: {
					organization: { id: orgId! },
					deletedAt: null,
					...(selectedClients.length ? { id: { in: selectedClients } } : {}),
				},
				...(Object.keys(dateFilter).length ? { startTime: dateFilter } : {}),
			},
		}),
		prisma.timeEntry.findMany({
			orderBy: { startTime: 'desc' },
			include: { client: true, invoice: true },
			where: {
				client: {
					organization: { id: orgId! },
					deletedAt: null,
				},
				startTime: {
					gte: startOfMonth(lastMonth),
					lte: endOfMonth(currentMonth),
				},
			},
		}),
	])

	const reports = timeEntries.reduce(
		(acc, entry) => {
			if (!entry.endTime) return acc

			const durationInMinutes =
				(new Date(entry.endTime).getTime() -
					new Date(entry.startTime).getTime()) /
				1000 /
				60
			const durationInHours = durationInMinutes / 60
			const rate = entry.hourlyRate || entry.client?.hourlyRate || 0
			const amount = durationInHours * Number(rate)

			if (entry.invoice) {
				if (entry.invoice.paidAt) {
					acc.paidTime += durationInMinutes
					acc.paidAmount += amount
				} else {
					acc.billedTime += durationInMinutes
					acc.billedAmount += amount
				}
			} else {
				acc.unbilledTime += durationInMinutes
				acc.unbilledAmount += amount
			}

			return acc
		},
		{
			unbilledTime: 0,
			billedTime: 0,
			paidTime: 0,
			unbilledAmount: 0,
			billedAmount: 0,
			paidAmount: 0,
		},
	)

	return {
		clients,
		activeTimeEntry,
		timeEntries: timeEntries.slice(skip, skip + take),
		timeEntriesCount,
		reports,
		burndownEntries,
	}
}

export async function action({ request }: ActionFunctionArgs) {
	const orgId = getOrgId(request)
	const formData = await request.formData()
	const model = formData.get('model')

	if (model === 'time_entry') {
		const intent = formData.get('intent')

		switch (intent) {
			case 'start': {
				const clientId = formData.get('clientId') as string
				const description = formData.get('description') as string
				const startTime = formData.get('startTime') as string
				let hourlyRate: number | null = null

				if (clientId) {
					const client = await prisma.client.findUnique({
						where: { id: clientId, organization: { id: orgId! } },
						select: { hourlyRate: true },
					})
					hourlyRate = client?.hourlyRate ? Number(client.hourlyRate) : null
				}

				const entry = await prisma.timeEntry.create({
					data: {
						startTime: new Date(startTime),
						description,
						hourlyRate,
						...(clientId ? { client: { connect: { id: clientId } } } : {}),
					},
				})
				return json({ entry })
			}
			case 'update': {
				const entryId = formData.get('entryId')
				const description = formData.get('description') as string | null
				const clientId = formData.get('clientId')
				const startTime = formData.get('startTime') as string | undefined
				let hourlyRate: number | null = null

				if (clientId) {
					const client = await prisma.client.findUnique({
						where: { id: clientId as string, organization: { id: orgId! } },
						select: { hourlyRate: true },
					})
					hourlyRate = client?.hourlyRate ? Number(client.hourlyRate) : null
				}

				const entry = await prisma.timeEntry.update({
					where: { id: entryId as string },
					data: {
						...(description ? { description } : {}),
						...(startTime ? { startTime: new Date(startTime) } : {}),
						...(hourlyRate ? { hourlyRate } : {}),
						client: clientId
							? { connect: { id: clientId as string } }
							: undefined,
					},
				})
				return json({ entry })
			}
			case 'stop': {
				const entryId = formData.get('entryId')
				await prisma.timeEntry.update({
					where: { id: entryId as string },
					data: { endTime: new Date() },
				})
				return json({ entry: null })
			}
		}
	}

	return json({ message: 'model actions not found' }, { status: 405 })
}

export default function Route() {
	const {
		clients,
		activeTimeEntry,
		timeEntries,
		timeEntriesCount,
		reports,
		burndownEntries,
	} = useLoaderData<typeof loader>()
	const startTimer = useFetcher<{ entry: TimeEntry | null }>()
	const [entry, setEntry] = useState<typeof activeTimeEntry>(activeTimeEntry)

	const descriptionRef = useRef<HTMLInputElement>(null)
	const clientIdRef = useRef<HTMLSelectElement>(null)

	const handleStart = () => {
		const f = new FormData()
		f.append('model', 'time_entry')
		f.append('intent', 'start')
		f.append('startTime', new Date().toISOString())
		f.append('clientId', clientIdRef.current?.value ?? '')
		f.append('description', descriptionRef.current?.value ?? '')
		startTimer.submit(f, { method: 'post' })
	}

	const handleStop = () => {
		if (!entry) return
		const f = new FormData()
		f.append('model', 'time_entry')
		f.append('intent', 'stop')
		f.append('entryId', entry.id)
		startTimer.submit(f, { method: 'post' })
		if (descriptionRef.current) descriptionRef.current.value = ''
		if (clientIdRef.current) clientIdRef.current.value = ''
	}

	const handleDescriptionBlur = (event: React.FocusEvent<HTMLInputElement>) => {
		if (!entry) return
		const f = new FormData()
		f.append('model', 'time_entry')
		f.append('intent', 'update')
		f.append('entryId', entry.id)
		f.append('description', event.target.value)
		startTimer.submit(f, { method: 'post' })
	}

	const handleClientChange = (clientId: string) => {
		if (!entry) return
		const f = new FormData()
		f.append('model', 'time_entry')
		f.append('intent', 'update')
		f.append('entryId', entry.id)
		f.append('clientId', clientId)
		startTimer.submit(f, { method: 'post' })
	}

	useEffect(() => {
		if (startTimer.data) {
			setEntry(startTimer.data.entry)
		}
	}, [startTimer.data])

	return (
		<div className="flex flex-col gap-6">
			<div className="flex justify-between gap-2">
				<h1 className="text-2xl font-bold">Dashboard</h1>
				<div className="flex items-center">
					<Button variant="link" asChild>
						<Link to="clients">Clients</Link>
					</Button>
					<Button variant="link" asChild>
						<Link to="/app/invoices">Invoices</Link>
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-3 md:h-40 md:flex-row md:gap-6">
				<div className="flex w-full flex-col gap-2 rounded border border-dashed p-4 md:w-1/2">
					<Input
						defaultValue={entry?.description ?? ''}
						placeholder="What are you working on?"
						onBlur={handleDescriptionBlur}
						className="w-full bg-white"
						name="description"
						ref={descriptionRef}
					/>

					<select
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
						onChange={e => handleClientChange(e.target.value)}
						defaultValue={entry?.clientId ?? ''}
						name="clientId"
						ref={clientIdRef}
					>
						<option value="">Select Client</option>
						{clients.map(client => (
							<option key={client.id} value={client.id}>
								{client.name}
							</option>
						))}
					</select>
					<div className="flex items-center gap-2">
						{entry && (
							<Timer
								startTime={new Date(entry.startTime)}
								onStartTimeChange={date => {
									const f = new FormData()
									f.append('model', 'time_entry')
									f.append('intent', 'update')
									f.append('entryId', entry.id)
									f.append('startTime', date.toISOString())
									startTimer.submit(f, { method: 'post' })
								}}
							/>
						)}
						<Button
							onClick={entry ? handleStop : handleStart}
							variant={entry ? 'destructive' : 'default'}
							className="h-full min-h-9 flex-1 text-lg"
						>
							<Clock size={18} className="mr-2" /> {entry ? 'Stop' : 'Start'}
						</Button>
					</div>
				</div>

				<div className="flex w-full gap-3">
					<Button
						variant="outline"
						className="h-40 w-full text-xl"
						size="lg"
						asChild
					>
						<Link to="/app/invoices/new">
							<div className="flex flex-col items-center gap-4">
								<div className="text-4xl">📧</div>
								<div>Create Invoice</div>
							</div>
						</Link>
					</Button>

					<Button variant="outline" className="h-40 w-full text-xl" size="lg">
						<div className="flex flex-col items-center gap-4">
							<div className="text-4xl">💰</div>
							<div>Record Payment</div>
						</div>
					</Button>
				</div>
			</div>

			<TimeEntriesTable
				entries={timeEntries as any}
				entriesCount={timeEntriesCount}
				clients={clients as any}
				reports={reports}
				burndownEntries={burndownEntries as any}
			/>
		</div>
	)
}
