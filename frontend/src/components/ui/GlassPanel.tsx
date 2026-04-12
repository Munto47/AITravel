'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { clsx } from 'clsx'

interface GlassPanelProps extends HTMLMotionProps<'div'> {
  /** 使用更高不透明度，适合需要高可读性的区域 */
  solid?: boolean
  children: React.ReactNode
  className?: string
}

export default function GlassPanel({
  solid = false,
  children,
  className,
  ...motionProps
}: GlassPanelProps) {
  return (
    <motion.div
      className={clsx(
        solid ? 'glass-panel-solid' : 'glass-panel',
        'rounded-glass',
        className,
      )}
      {...motionProps}
    >
      {children}
    </motion.div>
  )
}
