# Fix for bcrypt AttributeError

## Issue
`AttributeError: module 'bcrypt' has no attribute '__about__'`

This error occurs because bcrypt 4.1.0+ removed the `__about__` attribute that passlib relies on.

## Solution

1. **Uninstall the current bcrypt version:**
   ```bash
   pip uninstall bcrypt -y
   ```

2. **Install the compatible version:**
   ```bash
   pip install 'bcrypt==4.0.1'
   ```

   Or reinstall all requirements:
   ```bash
   pip install -r requirements.txt
   ```

3. **Verify the installation:**
   ```bash
   python -c "import bcrypt; print('bcrypt version:', bcrypt.__version__)"
   ```

## Alternative Solution (if 4.0.1 doesn't work)

If you need to use a different version, you can use bcrypt 3.2.2:
```bash
pip install 'bcrypt==3.2.2'
```

Then update requirements.txt:
```
bcrypt==3.2.2
```

## Why This Happens

- bcrypt 4.1.0+ removed the `__about__` module
- passlib 1.7.4 tries to access `bcrypt.__about__.__version__`
- This causes the AttributeError

## Prevention

Always pin bcrypt to a specific version in requirements.txt:
```
bcrypt==4.0.1
```

Instead of using a range:
```
bcrypt>=4.0.1,<5.0.0  # This allows 4.1.0+ which breaks passlib
```


