import { type Root } from '@radix-ui/react-select'
import { type ReactNode, useId, type ComponentPropsWithoutRef } from 'react'
import { useField } from 'remix-validated-form'
import { cn } from '#app/utils/misc'
import { startCase } from '#app/utils/startCase'
import { InfoCircledIcon } from '../icons'

import { Tooltip } from '../ui/tooltip'

interface Props extends ComponentPropsWithoutRef<typeof Root> {
	id?: string
	name: string
	label?: string
	labelInfo?: string
	hideLabel?: boolean
	className?: string
	helperText?: string
	options: { value: string | number; label: ReactNode }[]
	prefix?: ReactNode
	placeholder?: string
}

export function FormSelect({
	label,
	labelInfo,
	hideLabel,
	className,
	helperText,
	name,
	prefix,
	placeholder,
	...props
}: Props) {
	const fallbackId = useId()
	const id = props.id ?? fallbackId
	const { error, getInputProps } = useField(name)
	const errorId = error?.length ? `${id}-error` : undefined

	return (
		<div className={cn('flex flex-col gap-1', className)}>
			{labelInfo ? (
				<label htmlFor={id}>
					<span className="flex items-center gap-2">
						{label ?? startCase(name)}{' '}
						<Tooltip text={<p className="max-w-[300px]">{labelInfo}</p>}>
							<InfoCircledIcon />
						</Tooltip>
					</span>
				</label>
			) : hideLabel ? null : (
				<label htmlFor={id}>{label ?? startCase(name)}</label>
			)}
			<select
				value={props.value?.toString()}
				defaultValue={props.defaultValue?.toString()}
				dir="ltr"
				className={cn(
					'w-full rounded-md border p-2 text-sm shadow-sm',
					error && 'border-destructive',
					className,
				)}
				aria-invalid={errorId ? true : undefined}
				aria-describedby={errorId}
				{...getInputProps({ id, ...props })}
			>
				{props.options.map(opt => (
					<option
						key={opt.value}
						value={opt.value.toString()}
						onClick={e => {
							e.preventDefault()
							e.stopPropagation()
						}}
						className="text-lg"
					>
						{opt.label}
					</option>
				))}
			</select>
			{helperText ? (
				<p className="text-xs text-muted-foreground">{helperText}</p>
			) : null}
			{error ? (
				<p className="text-left text-[12px] text-destructive">{error}</p>
			) : null}
		</div>
	)
}
