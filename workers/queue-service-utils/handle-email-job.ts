import { Resend } from 'resend'

interface EmailJobPayload {
	fromName: string
	fromEmail: string
	to: string
	subject: string
	body: string
	bcc?: string[]
	cc?: string[]
	attachments?: Array<{
		url: string
		filename: string
	}>
}

const resend = new Resend(process.env.RESEND_API_KEY)

export async function handleEmailJob(data: EmailJobPayload) {
	const attachments = data.attachments
		? await Promise.all(
				data.attachments.map(async attachment => {
					const response = await fetch(attachment.url)
					const content = await response.arrayBuffer()
					return {
						filename: attachment.filename,
						content: Buffer.from(content),
					}
				}),
			)
		: []

	await resend.emails.send({
		from: `${data.fromName} <${data.fromEmail}>`,
		to: data.to,
		bcc: data.bcc,
		cc: data.cc,
		subject: data.subject,
		html: data.body,
		attachments,
	})
}
