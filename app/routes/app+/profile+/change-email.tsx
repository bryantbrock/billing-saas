import { parseWithZod as parse } from '@conform-to/zod'
import * as E from '@react-email/components'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	json,
	redirect,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { serverOnly$ } from 'vite-env-only'
import { z } from 'zod'
import { FormInput } from '#app/components/forms/form-input'
import { EnvelopeClosedIcon } from '#app/components/icons'
import { Button, buttonVariants } from '#app/components/ui/button'
import {
	prepareVerification,
	requireRecentVerification,
	type VerifyFunctionArgs,
} from '#app/routes/auth+/verify.server'
import { requireUserId } from '#app/utils/auth.server.ts'
import { type BreadcrumbHandle } from '#app/utils/breadcrumb'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { EmailSchema } from '#app/utils/schemas/user.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: (
		<Link
			to="/app/profile/change-email"
			className={buttonVariants({ variant: 'ghost', size: 'sm' })}
		>
			<EnvelopeClosedIcon className="mr-2" /> Change email
		</Link>
	),
}

const newEmailAddressSessionKey = 'new-email-address'

export const handleVerification = serverOnly$(
	async ({ request, data }: VerifyFunctionArgs) => {
		await requireRecentVerification(request)

		const verifySession = await verifySessionStorage.getSession(
			request.headers.get('cookie'),
		)
		const newEmail = verifySession.get(newEmailAddressSessionKey)

		if (!newEmail) {
			return validationError({
				fieldErrors: {
					code: 'You must submit the code on the same device that requested the email change.',
				},
			})
		}

		const preUpdateUser = await prisma.user.findFirstOrThrow({
			select: { email: true },
			where: { id: data.target },
		})
		const user = await prisma.user.update({
			where: { id: data.target },
			select: { id: true, email: true },
			data: { email: newEmail },
		})

		void sendEmail({
			to: preUpdateUser.email,
			subject: 'Ploductivity email changed',
			react: <EmailChangeNoticeEmail userId={user.id} />,
		})

		return redirectWithToast(
			'/app/profile',
			{
				title: 'Email Changed',
				type: 'success',
				description: `Your email has been changed to ${user.email}`,
			},
			{
				headers: {
					'set-cookie':
						await verifySessionStorage.destroySession(verifySession),
				},
			},
		)
	},
)

const ChangeEmailSchema = z.object({
	email: EmailSchema,
})

const validator = withZod(ChangeEmailSchema)

export async function loader({ request }: LoaderFunctionArgs) {
	await requireRecentVerification(request)
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { email: true },
	})
	if (!user) {
		const params = new URLSearchParams({ redirectTo: request.url })
		throw redirect(`/auth/login?${params}`)
	}
	return json({ user })
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const submission = await parse(formData, {
		schema: ChangeEmailSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email },
			})
			if (existingUser) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'This email is already in use.',
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { otp, redirectTo, verifyUrl } = await prepareVerification({
		period: 10 * 60,
		request,
		target: userId,
		type: 'change-email',
	})

	const response = await sendEmail({
		to: submission.value.email,
		subject: `Ploductivity Email Change Verification`,
		react: <EmailChangeEmail verifyUrl={verifyUrl.toString()} otp={otp} />,
	})

	if (response.status === 'success') {
		const verifySession = await verifySessionStorage.getSession()
		verifySession.set(newEmailAddressSessionKey, submission.value.email)
		return redirect(redirectTo.toString(), {
			headers: {
				'set-cookie': await verifySessionStorage.commitSession(verifySession),
			},
		})
	} else {
		return json(submission.reply({ formErrors: [response.error.message] }), {
			status: 500,
		})
	}
}

export function EmailChangeEmail({
	verifyUrl,
	otp,
}: {
	verifyUrl: string
	otp: string
}) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Ploductivity Email Change</E.Text>
				</h1>
				<p>
					<E.Text>
						Here's your verification code: <strong>{otp}</strong>
					</E.Text>
				</p>
				<p>
					<E.Text>Or click the link:</E.Text>
				</p>
				<E.Link href={verifyUrl}>{verifyUrl}</E.Link>
			</E.Container>
		</E.Html>
	)
}

export function EmailChangeNoticeEmail({ userId }: { userId: string }) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Your Ploductivity email has been changed</E.Text>
				</h1>
				<p>
					<E.Text>
						We're writing to let you know that your Ploductivity email has been
						changed.
					</E.Text>
				</p>
				<p>
					<E.Text>
						If you changed your email address, then you can safely ignore this.
						But if you did not change your email address, then please contact
						support immediately.
					</E.Text>
				</p>
				<p>
					<E.Text>Your Account ID: {userId}</E.Text>
				</p>
			</E.Container>
		</E.Html>
	)
}

export default function ChangeEmailIndex() {
	const data = useLoaderData<typeof loader>()

	return (
		<div>
			<h2>Change Email</h2>
			<p className="mt-2">
				You will receive an email at the new email address to confirm. An email
				notice will also be sent to your old address{' '}
				<strong>{data.user.email}</strong>.
			</p>
			<div className="mt-5">
				<ValidatedForm validator={validator} method="POST">
					<AuthenticityTokenInput />
					<FormInput name="email" label="New Email" />
					<Button className="mt-2" type="submit">
						Send Confirmation
					</Button>
				</ValidatedForm>
			</div>
		</div>
	)
}
