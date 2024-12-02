import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	json,
} from '@remix-run/node'
import { redirect, useLoaderData } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import {
	ValidatedForm,
	validationError,
	FieldArray,
} from 'remix-validated-form'
import { z } from 'zod'
import { FormInput } from '#app/components/forms/form-input.js'
import { Button } from '#app/components/ui/button'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { NameSchema } from '#app/utils/schemas/user'

export const handle = { showBackButton: true }

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			organizations: {
				select: {
					id: true,
					name: true,
					line1: true,
					line2: true,
					city: true,
					state: true,
					zip: true,
					phone: true,
					email: true,
				},
			},
			image: { select: { id: true } },
			_count: {
				select: {
					sessions: {
						where: {
							expirationDate: { gt: new Date() },
						},
					},
				},
			},
		},
	})

	return json({ user })
}

const validator = withZod(
	z.object({
		name: NameSchema.min(1, 'Name is required').max(40, 'Name is too long'),
		organizations: z.array(
			z.object({
				id: z.string().nullish(),
				name: z.string().min(1, 'Name is required'),
				line1: z.string().nullish(),
				line2: z.string().nullish(),
				city: z.string().nullish(),
				state: z.string().nullish(),
				zip: z.string().nullish(),
				phone: z.string().nullish(),
				email: z.string().nullish(),
			}),
		),
	}),
)

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	await prisma.user.update({
		where: { id: userId },
		data: {
			name: data.name,
			organizations: {
				deleteMany: {
					id: { notIn: data.organizations.map(org => org.id).filter(Boolean) },
				},
				upsert: data.organizations.map(org => ({
					where: {
						id: org.id ?? '',
					},
					create: {
						name: org.name,
						line1: org.line1,
						line2: org.line2,
						city: org.city,
						state: org.state,
						zip: org.zip,
						phone: org.phone,
						email: org.email,
					},
					update: {
						name: org.name,
						line1: org.line1,
						line2: org.line2,
						city: org.city,
						state: org.state,
						zip: org.zip,
						phone: org.phone,
						email: org.email,
					},
				})),
			},
		},
	})

	return redirect('/app')
}

export default function ProfileRoute() {
	const data = useLoaderData<typeof loader>()

	return (
		<div className="flex h-full grow flex-col gap-4">
			<div className="flex flex-grow flex-col gap-6">
				<ValidatedForm
					method="POST"
					className="flex flex-col gap-6"
					validator={validator}
					defaultValues={{
						name: data.user.name ?? '',
						organizations: data.user.organizations ?? [],
					}}
				>
					<div className="space-y-2">
						<h2 className="text-lg font-semibold">Your Profile</h2>
						<FormInput name="name" type="text" label="Name" />
					</div>

					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<h2 className="text-lg font-semibold">Organizations</h2>
							<p className="text-sm text-muted-foreground">
								First organization will be used as default
							</p>
						</div>

						<FieldArray name="organizations">
							{(fields, { push, remove }) => (
								<div className="space-y-4">
									{fields.map((field, index) => (
										<div
											key={field.key}
											className="relative rounded-lg border border-gray-200 p-4"
										>
											{index === 0 && (
												<span className="absolute -top-3 left-4 bg-muted px-2 text-sm text-muted-foreground">
													Default Organization
												</span>
											)}
											<div className="space-y-4">
												<input
													type="hidden"
													value={field.defaultValue.id}
													name={`organizations[${index}].id`}
												/>
												<FormInput
													name={`organizations[${index}].name`}
													label="Organization Name"
													type="text"
													required
												/>
												<FormInput
													name={`organizations[${index}].line1`}
													label="Address Line 1"
													type="text"
												/>
												<FormInput
													name={`organizations[${index}].line2`}
													label="Address Line 2"
													type="text"
												/>
												<div className="grid grid-cols-3 gap-4">
													<FormInput
														name={`organizations[${index}].city`}
														label="City"
														type="text"
													/>
													<FormInput
														name={`organizations[${index}].state`}
														label="State"
														type="text"
													/>
													<FormInput
														name={`organizations[${index}].zip`}
														label="ZIP"
														type="text"
													/>
												</div>
												<FormInput
													name={`organizations[${index}].phone`}
													label="Phone"
													type="tel"
												/>
												<FormInput
													name={`organizations[${index}].email`}
													label="Email"
													type="email"
												/>
												<Button
													type="button"
													variant="destructive"
													onClick={() => remove(index)}
													className="mt-4"
												>
													Remove
												</Button>
											</div>
										</div>
									))}
									<Button
										type="button"
										variant="outline"
										onClick={() => push({ name: '' })}
										className="w-full"
									>
										Add Organization
									</Button>
								</div>
							)}
						</FieldArray>
					</div>

					<Button type="submit" className="mt-4">
						Save changes
					</Button>
				</ValidatedForm>
			</div>
		</div>
	)
}
