import { useState, forwardRef } from 'react'
import { Form, InputGroup, Button } from 'react-bootstrap'

/**
 * Drop-in replacement for a `<Form.Control type="password">` that adds a
 * Show/Hide toggle, reusing the pattern that already existed independently
 * in several forms across the app (vault setup, vault password change,
 * digital vault credential entries, export vault password).
 *
 * All props (value, onChange, placeholder, autoComplete, isInvalid,
 * onKeyDown, style, etc.) are forwarded straight through to the underlying
 * Form.Control, and `ref` is forwarded to the underlying <input> element, so
 * this is a direct swap for `<Form.Control type="password" ... />`.
 *
 * Toggling visibility only flips the input's `type` attribute between
 * "password" and "text" in the browser. It does not change how the value is
 * captured, transmitted, stored, or logged, that logic lives entirely in
 * each form's own onChange/onSubmit handlers, which are untouched.
 */
const PasswordInput = forwardRef(function PasswordInput(
  { className, buttonVariant = 'outline-secondary', buttonSize, ...controlProps },
  ref
) {
  const [visible, setVisible] = useState(false)

  // Match the toggle button's size to the input's own `size` (sm/lg) unless
  // a size was explicitly given for the button, so InputGroup renders both
  // at the same height, same as the hand-rolled versions of this pattern did.
  const resolvedButtonSize = buttonSize ?? controlProps.size

  return (
    <InputGroup className={className} hasValidation={controlProps.isInvalid}>
      <Form.Control
        {...controlProps}
        ref={ref}
        type={visible ? 'text' : 'password'}
      />
      <Button
        variant={buttonVariant}
        size={resolvedButtonSize}
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </Button>
    </InputGroup>
  )
})

export default PasswordInput
