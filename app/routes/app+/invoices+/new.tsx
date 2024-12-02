import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Form, Link, useLoaderData } from '@remix-run/react'
import { useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		include: {
			organizations: {
				include: {
					clients: {
						include: {
							timeEntries: {
								where: { invoiceId: null },
								orderBy: { startTime: 'desc' },
							},
						},
					},
				},
			},
		},
	})

	return json({ user })
}

export default function NewInvoice() {
	const { user } = useLoaderData<typeof loader>()
	const [selectedClient, setSelectedClient] = useState('')
	const [netDays, setNetDays] = useState(15)
	const [tax, setTax] = useState(0)
	const [discount, setDiscount] = useState(0)

	const dueDate = new Date(Date.now() + netDays * 24 * 60 * 60 * 1000)
		.toISOString()
		.split('T')[0]

	const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`

	const org = user.organizations[0]
	const client = org.clients.find(c => c.id === selectedClient)
	const unbilledEntries = client?.timeEntries || []
	const subtotal = unbilledEntries.reduce((sum, entry) => {
		const hours = entry.endTime
			? (new Date(entry.endTime).getTime() -
					new Date(entry.startTime).getTime()) /
				(1000 * 60 * 60)
			: 0
		const rate = entry.hourlyRate || client?.hourlyRate || 0
		return sum + hours * Number(rate)
	}, 0)

	const InvoicePreview = () => (
		<div className="bg-white">
			<div className="flex justify-between">
				<div>
					<h1 className="m-0 text-2xl font-bold">{org.name}</h1>
					<p className="m-0 text-gray-600">
						{org.line1}
						<br />
						{org.line2 && (
							<>
								{org.line2}
								<br />
							</>
						)}
						{org.city}, {org.state} {org.zip}
						<br />
						{org.phone && (
							<>
								{org.phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}
								<br />
							</>
						)}
						{org.email && <>{org.email}</>}
					</p>
				</div>
				<div className="text-right">
					<p className="m-0 font-bold">INVOICE</p>
					<p className="m-0 text-gray-600">
						Date: {new Date().toLocaleDateString()}
						<br />
						Due Date: {new Date(dueDate + 'T00:00:00').toLocaleDateString()}
						<br />
						Invoice #: {invoiceNumber}
					</p>
				</div>
			</div>

			<hr className="my-4 border-gray-200" />

			<div>
				<p className="m-0 font-bold">Bill To:</p>
				<p className="m-0">
					{client?.name}
					<br />
					{client?.company && (
						<>
							{client.company}
							<br />
						</>
					)}
					{client?.line1}
					<br />
					{client?.line2 && (
						<>
							{client.line2}
							<br />
						</>
					)}
					{client?.city}, {client?.state} {client?.zip}
				</p>
			</div>

			<div className="my-8">
				<table className="w-full">
					<thead>
						<tr className="border-b border-gray-200">
							<th className="py-2 text-left">Date</th>
							<th className="py-2 text-left">Description</th>
							<th className="py-2 text-right">Hours</th>
							<th className="py-2 text-right">Rate</th>
							<th className="py-2 text-right">Amount</th>
						</tr>
					</thead>
					<tbody>
						{unbilledEntries.map(entry => {
							const hours = entry.endTime
								? (new Date(entry.endTime).getTime() -
										new Date(entry.startTime).getTime()) /
									(1000 * 60 * 60)
								: 0
							const rate = entry.hourlyRate || client?.hourlyRate || 0
							const amount = hours * Number(rate)

							return (
								<tr key={entry.id} className="border-b border-gray-200">
									<td className="py-2">
										{new Date(entry.startTime).toLocaleDateString()}
									</td>
									<td className="py-2">{entry.description}</td>
									<td className="py-2 text-right">{hours.toFixed(2)}</td>
									<td className="py-2 text-right">
										${Number(rate).toFixed(2)}
									</td>
									<td className="py-2 text-right">${amount.toFixed(2)}</td>
								</tr>
							)
						})}
						<tr className="border-t-2 border-gray-200">
							<td colSpan={4} className="py-2 text-right font-bold">
								Subtotal:
							</td>
							<td className="py-2 text-right">
								${subtotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
							</td>
						</tr>
						{tax > 0 && (
							<tr>
								<td colSpan={4} className="py-2 text-right">
									Tax ({tax}%):
								</td>
								<td className="py-2 text-right">
									${((subtotal * tax) / 100).toFixed(2)}
								</td>
							</tr>
						)}
						{discount > 0 && (
							<tr>
								<td colSpan={4} className="py-2 text-right">
									Discount:
								</td>
								<td className="py-2 text-right">-${discount.toFixed(2)}</td>
							</tr>
						)}
						<tr className="border-t border-gray-200 font-bold">
							<td colSpan={4} className="py-2 text-right">
								Total:
							</td>
							<td className="py-2 text-right">
								$
								{(subtotal + (subtotal * (tax || 0)) / 100 - (discount || 0))
									.toFixed(2)
									.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	)

	return (
		<div className="mx-auto max-w-7xl">
			<div className="mb-8">
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
							1
						</div>
						<span className="font-medium">Create Invoice</span>
					</div>
					<div className="h-0.5 flex-1 bg-gray-200" />
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
							2
						</div>
						<span className="text-gray-500">Send Invoice</span>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
				<div>
					<Form method="post" className="space-y-6">
						<input type="hidden" name="invoiceNumber" value={invoiceNumber} />
						<div className="space-y-4">
							<div>
								<label className="mb-2 block text-sm font-medium">Client</label>
								<select
									name="clientId"
									className="w-full rounded border p-2"
									onChange={e => setSelectedClient(e.target.value)}
									value={selectedClient}
								>
									<option value="">Select a client...</option>
									{org.clients.map(client => (
										<option key={client.id} value={client.id}>
											{client.name}
										</option>
									))}
								</select>
							</div>

							<div>
								<label className="mb-2 block text-sm font-medium">
									Payment Terms
								</label>
								<div className="flex flex-wrap gap-2">
									<input type="hidden" name="dueDate" value={dueDate} />
									{[
										{ days: 0, label: 'Due Now' },
										{ days: 5, label: 'Net 5' },
										{ days: 10, label: 'Net 10' },
										{ days: 15, label: 'Net 15' },
										{ days: 30, label: 'Net 30' },
									].map(({ days, label }) => (
										<Button
											key={days}
											type="button"
											size="lg"
											onClick={() => setNetDays(days)}
											variant={netDays === days ? 'outline' : 'ghost'}
										>
											{label}
										</Button>
									))}
								</div>
							</div>

							<div className="flex gap-4">
								<div className="w-1/2">
									<label className="mb-2 block text-sm font-medium">
										Tax Rate (%)
									</label>
									<Input
										type="number"
										name="tax"
										min="0"
										max="100"
										step="0.1"
										className="w-full bg-white"
										value={tax}
										onChange={e => setTax(Number(e.target.value))}
									/>
								</div>
								<div className="w-1/2">
									<label className="mb-2 block text-sm font-medium">
										Discount ($)
									</label>
									<Input
										type="number"
										name="discount"
										min="0"
										step="0.01"
										className="w-full bg-white"
										value={discount}
										onChange={e => setDiscount(Number(e.target.value))}
									/>
								</div>
							</div>
						</div>

						<div className="flex gap-4">
							<Button
								type="button"
								size="lg"
								variant="outline"
								className="w-1/2"
								asChild
							>
								<Link to="/app">Cancel</Link>
							</Button>
							<Button
								type="submit"
								size="lg"
								className="w-full"
								disabled={!selectedClient}
							>
								Next
							</Button>
						</div>
					</Form>
				</div>

				<div className="lg:sticky lg:top-6">
					{selectedClient ? (
						<div className="rounded-lg border bg-white p-6 text-sm shadow-sm">
							<InvoicePreview />
						</div>
					) : (
						<div className="flex h-full items-center justify-center rounded-lg border border-dashed p-12 text-center text-gray-500">
							Select a client to preview invoice
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
