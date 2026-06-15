from app import app, init_database


# WSGI entrypoint used by production hosts such as Render, Railway or Fly.io.
init_database(app)
