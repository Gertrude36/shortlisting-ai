try:
    import importlib.util, sys, traceback
    spec = importlib.util.spec_from_file_location("candidate_scorer","backend/candidate_scorer.py")
    module = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError('No loader for spec')
    spec.loader.exec_module(module)
    print('import_ok')
except Exception as e:
    print('error', type(e).__name__, str(e))
    traceback.print_exc()
