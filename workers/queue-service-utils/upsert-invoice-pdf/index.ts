/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'
import {
	PutObjectCommand,
	S3Client,
	DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { type PrismaClient } from '@prisma/client'
import Mustache from 'mustache'
import puppeteer from 'puppeteer-core'

export interface upsertInvoicePdfPayload {
	invoiceId: string
}

const s3Client = new S3Client({
	region: process.env.AWS_REGION,
	endpoint: process.env.AWS_ENDPOINT,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
	},
})

const getHtmlTemplate = (filePath: string): string => {
	const fullPath = path.resolve(process.cwd(), filePath)
	return fs.readFileSync(fullPath, 'utf-8')
}

const generatePDF = async ({
	bodyHtml,
	footerHtml,
	headerHtml,
}: {
	bodyHtml: string
	footerHtml: string
	headerHtml: string
}) => {
	const browser = await puppeteer.launch({
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
		executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
		headless: true,
	})

	const page = await browser.newPage()
	await page.setContent(bodyHtml)
	await page.emulateMediaType('print')

	const pdfBuffer = await page.pdf({
		displayHeaderFooter: true,
		footerTemplate: footerHtml,
		format: 'A4',
		headerTemplate: headerHtml,
	})

	await browser.close()

	return pdfBuffer
}

const formatAmount = (amount: number) => {
	return amount.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
}

export async function upsertInvoicePdf(
	prisma: PrismaClient,
	data: upsertInvoicePdfPayload,
) {
	console.time(`[upsert-invoice-pdf] Created invoice PDF for ${data.invoiceId}`)

	const invoice = await prisma.invoice.findUniqueOrThrow({
		where: { id: data.invoiceId },
		include: { timeEntries: true, client: { include: { organization: true } } },
	})

	const timeEntries = invoice.timeEntries.map(entry => {
		const hours = entry.endTime
			? (new Date(entry.endTime).getTime() -
					new Date(entry.startTime).getTime()) /
				1000 /
				60 /
				60
			: 0
		const rate =
			entry.hourlyRate !== null
				? Number(entry.hourlyRate)
				: invoice.client.hourlyRate !== null
					? Number(invoice.client.hourlyRate)
					: 0

		return {
			...entry,
			date: new Date(entry.startTime).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			}),
			hours,
			rate,
			amount: hours * rate,
		}
	})

	const subtotal = timeEntries.reduce((sum, entry) => sum + entry.amount, 0)
	const taxAmount = invoice.tax ? subtotal * Number(invoice.tax) : 0
	const total = subtotal + taxAmount - (Number(invoice.discount) || 0)

	const bodyHtml = Mustache.render(
		getHtmlTemplate('workers/queue-service-utils/upsert-invoice-pdf/body.html'),
		{
			invoice: {
				...invoice,
				timeEntries: timeEntries.map(entry => ({
					...entry,
					hours: entry.hours.toFixed(2),
					amount: formatAmount(entry.amount),
					rate: formatAmount(entry.rate),
				})),
				createdAt: invoice.createdAt.toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				}),
				dueDate: invoice.dueDate.toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				}),
				subtotal: formatAmount(subtotal),
				taxAmount: taxAmount > 0 ? formatAmount(taxAmount) : '',
				discount:
					invoice.discount && Number(invoice.discount) > 0
						? formatAmount(Number(invoice.discount))
						: '',
				total: formatAmount(total),
			},
		},
	)
	const headerHtml = Mustache.render(
		getHtmlTemplate(
			'workers/queue-service-utils/upsert-invoice-pdf/header.html',
		),
		{ invoice },
	)

	const buffer = await generatePDF({
		headerHtml,
		bodyHtml,
		footerHtml: `
			<div style="text-align: right;width: 297mm;font-size: 8px;">
				<span style="margin-right: 1cm">
					<span class="pageNumber"></span> of <span class="totalPages"></span>
				</span>
			</div>
		`,
	})

	const params = {
		Body: buffer,
		Bucket: 'billing-saas-uploads',
		ContentType: 'application/pdf',
		Key: `invoices/${data.invoiceId}.pdf`,
	}

	try {
		await s3Client.send(new PutObjectCommand(params))
	} catch (error) {
		if (error instanceof Error && error.name === 'KeyAlreadyExistsError') {
			// Delete existing file
			await s3Client.send(
				new DeleteObjectCommand({ Bucket: params.Bucket, Key: params.Key }),
			)
			// Retry upload
			await s3Client.send(new PutObjectCommand(params))
		} else {
			throw error
		}
	}

	console.timeEnd(
		`[upsert-invoice-pdf] Created invoice PDF for ${data.invoiceId}`,
	)
}