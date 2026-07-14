# adersh-m-site

Personal website of **Adersh Maruvattu** — roboticist (IIT Kanpur) and co-founder & CTO of Ceres FieldCheck.

Hand-coded, no framework build step. The homepage is a single `index.html`; the live 3D robot in the "lab" section is a lightweight WebGL rebuild of the MMS research platform (`assets/mms-sim.js`), with three.js vendored locally under `assets/vendor/`.

## Run locally
Just open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploy
Served as a static site via GitHub Pages from the default branch.
